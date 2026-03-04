/**
 * Daemon process: creates a Unix domain socket server, manages sessions,
 * and handles graceful shutdown.
 *
 * The daemon is the central coordinator. It accepts commands from CLI clients
 * over a socket and feeds them to Cypress through the cy.task() polling loop.
 *
 * One daemon per session. Socket path:
 *   $XDG_RUNTIME_DIR/cypress-cli/<sessionId>.sock
 *   fallback: $TMPDIR/cypress-cli/<sessionId>.sock
 */

import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { SocketConnection, type MessageHandler } from './connection.js';
import {
	type CommandMessage,
	type ProtocolMessage,
	type ResponseMessage,
	type ErrorMessage,
} from './protocol.js';
import {
	SessionMap,
	Session,
	type SessionConfig,
	SessionError,
} from './session.js';
import type { QueuedCommand, CommandResult } from './commandQueue.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default idle timeout (in ms) before the daemon auto-exits after the last
 * session closes. 0 means no auto-exit.
 */
const DEFAULT_IDLE_TIMEOUT = 30_000;

/**
 * Subdirectory under the runtime dir for socket files.
 */
const SOCKET_DIR_NAME = 'cypress-cli';

// ---------------------------------------------------------------------------
// Daemon configuration
// ---------------------------------------------------------------------------

/**
 * Options for creating a new Daemon instance.
 */
export interface DaemonOptions {
	/** Session ID. Used for naming the socket file. */
	sessionId: string;
	/** Idle timeout in ms. Daemon exits after this duration with no sessions. 0 = no auto-exit. */
	idleTimeout?: number;
	/** Override the socket directory path (for testing). */
	socketDir?: string;
}

// ---------------------------------------------------------------------------
// Daemon class
// ---------------------------------------------------------------------------

/**
 * The daemon server process. Listens on a Unix domain socket,
 * manages sessions, and bridges CLI commands to Cypress.
 */
export class Daemon {
	private _server: net.Server | null = null;
	private _sessions: SessionMap;
	private _socketPath: string;
	private _socketDir: string;
	private _idleTimeout: number;
	private _idleTimer: ReturnType<typeof setTimeout> | null = null;
	private _connections = new Set<SocketConnection>();
	private _isShuttingDown = false;

	constructor(options: DaemonOptions) {
		this._sessions = new SessionMap();
		this._idleTimeout = options.idleTimeout ?? DEFAULT_IDLE_TIMEOUT;
		this._socketDir = options.socketDir ?? resolveSocketDir();
		this._socketPath = path.join(this._socketDir, `${options.sessionId}.sock`);
	}

	// -----------------------------------------------------------------------
	// Lifecycle
	// -----------------------------------------------------------------------

	/**
	 * Start the daemon: create the socket directory, bind the UDS server,
	 * and begin accepting connections.
	 *
	 * @returns A Promise that resolves when the server is listening
	 */
	async start(): Promise<void> {
		// Ensure the socket directory exists
		await fs.mkdir(this._socketDir, { recursive: true });

		// Clean up stale socket file if present
		await this._cleanStaleSocket();

		return new Promise<void>((resolve, reject) => {
			this._server = net.createServer((socket) => {
				this._handleConnection(socket);
			});

			this._server.on('error', (err) => {
				reject(
					new DaemonError(`Failed to start daemon server: ${err.message}`),
				);
			});

			this._server.listen(this._socketPath, () => {
				resolve();
			});
		});
	}

	/**
	 * Gracefully stop the daemon: close all connections, stop all sessions,
	 * remove the socket file, and shut down the server.
	 */
	async stop(): Promise<void> {
		if (this._isShuttingDown) {
			return;
		}
		this._isShuttingDown = true;

		// Clear idle timer
		if (this._idleTimer) {
			clearTimeout(this._idleTimer);
			this._idleTimer = null;
		}

		// Stop all sessions
		this._sessions.stopAll();

		// Close all connections
		for (const conn of this._connections) {
			conn.close();
		}
		this._connections.clear();

		// Close the server
		if (this._server) {
			await new Promise<void>((resolve) => {
				this._server!.close(() => resolve());
			});
			this._server = null;
		}

		// Remove socket file
		await this._removeSocketFile();
	}

	// -----------------------------------------------------------------------
	// Session management
	// -----------------------------------------------------------------------

	/**
	 * Create a new session with the given configuration.
	 *
	 * @param config - Session configuration
	 * @returns The newly created session
	 */
	createSession(config: SessionConfig): Session {
		const session = this._sessions.create(config);
		// Cancel idle timer since we have an active session
		if (this._idleTimer) {
			clearTimeout(this._idleTimer);
			this._idleTimer = null;
		}
		return session;
	}

	/**
	 * Get a session by ID.
	 */
	getSession(id: string): Session | undefined {
		return this._sessions.get(id);
	}

	/**
	 * Stop and remove a session.
	 *
	 * @param id - Session identifier
	 */
	stopSession(id: string): void {
		const session = this._sessions.get(id);
		if (session && session.state !== 'stopped') {
			session.transition('stopped');
		}
		this._sessions.remove(id);

		// Start idle timer if no sessions remain
		if (this._sessions.size === 0 && this._idleTimeout > 0) {
			this._startIdleTimer();
		}
	}

	// -----------------------------------------------------------------------
	// Accessors
	// -----------------------------------------------------------------------

	/**
	 * The Unix socket path the daemon is listening on.
	 */
	get socketPath(): string {
		return this._socketPath;
	}

	/**
	 * The session map.
	 */
	get sessions(): SessionMap {
		return this._sessions;
	}

	/**
	 * Whether the daemon is in the process of shutting down.
	 */
	get isShuttingDown(): boolean {
		return this._isShuttingDown;
	}

	/**
	 * Number of active client connections.
	 */
	get connectionCount(): number {
		return this._connections.size;
	}

	// -----------------------------------------------------------------------
	// Connection handling
	// -----------------------------------------------------------------------

	/**
	 * Handle a new client connection.
	 */
	private _handleConnection(socket: net.Socket): void {
		const conn = new SocketConnection(socket);
		this._connections.add(conn);

		conn.onMessage((message: ProtocolMessage) => {
			this._handleMessage(conn, message);
		});

		conn.onClose(() => {
			this._connections.delete(conn);
		});

		conn.onError(() => {
			conn.close();
			this._connections.delete(conn);
		});
	}

	/**
	 * Handle an incoming protocol message from a client.
	 */
	private _handleMessage(
		conn: SocketConnection,
		message: ProtocolMessage,
	): void {
		// Only handle command messages from clients
		if (!('method' in message)) {
			return;
		}

		const cmd = message as CommandMessage;

		if (cmd.method === 'stop') {
			this._handleStop(conn, cmd);
			return;
		}

		if (cmd.method === 'run') {
			this._handleRun(conn, cmd);
			return;
		}
	}

	/**
	 * Handle a "run" command: parse the command args, enqueue it,
	 * and send the result back to the client when it completes.
	 */
	private _handleRun(conn: SocketConnection, message: CommandMessage): void {
		const args = message.params.args._;
		if (args.length === 0) {
			const errorMsg: ErrorMessage = {
				id: message.id,
				error:
					'No command specified. Provide a command name (e.g., "click e5").',
			};
			conn.send(errorMsg);
			return;
		}

		const action = args[0];
		const ref = args[1];
		const text = args.length > 2 ? args.slice(2).join(' ') : undefined;

		// Build options from any extra params
		const { _: _positional, ...options } = message.params.args;

		const command: QueuedCommand = {
			id: message.id,
			action,
			...(ref !== undefined && { ref }),
			...(text !== undefined && { text }),
			...(Object.keys(options).length > 0 && { options }),
		};

		// Find a running session to enqueue the command into
		const session = this._findRunningSession();
		if (!session) {
			const errorMsg: ErrorMessage = {
				id: message.id,
				error: 'No session running. Run `cypress-cli open <url>` to start one.',
			};
			conn.send(errorMsg);
			return;
		}

		try {
			session
				.enqueueCommand(command)
				.then((result: CommandResult) => {
					// Client may have disconnected while the command was running
					if (conn.isClosed) return;

					// Record in history
					session.recordHistory(command, result);

					// Send result back to client
					const response: ResponseMessage = {
						id: message.id,
						result: {
							success: result.success,
							...(result.snapshot !== undefined && {
								snapshot: result.snapshot,
							}),
							...(result.selector !== undefined && {
								selector: result.selector,
							}),
							...(result.cypressCommand !== undefined && {
								cypressCommand: result.cypressCommand,
							}),
						},
					};
					conn.send(response);
				})
				.catch((err: Error) => {
					// Client may have disconnected while the command was running
					if (conn.isClosed) return;

					const errorMsg: ErrorMessage = {
						id: message.id,
						error: err.message,
					};
					conn.send(errorMsg);
				});
		} catch (err) {
			const errorMsg: ErrorMessage = {
				id: message.id,
				error: err instanceof Error ? err.message : String(err),
			};
			conn.send(errorMsg);
		}
	}

	/**
	 * Handle a "stop" command: stop the session and shut down.
	 */
	private _handleStop(conn: SocketConnection, message: CommandMessage): void {
		const response: ResponseMessage = {
			id: message.id,
			result: { success: true },
		};
		conn.send(response);

		// Stop all sessions and shut down
		this.stop().catch(() => {
			// Best-effort shutdown
		});
	}

	/**
	 * Find the first running session.
	 * For now, the daemon supports one session at a time.
	 */
	private _findRunningSession(): Session | undefined {
		for (const id of this._sessions.ids) {
			const session = this._sessions.get(id);
			if (session && session.state === 'running') {
				return session;
			}
		}
		return undefined;
	}

	// -----------------------------------------------------------------------
	// Idle timer
	// -----------------------------------------------------------------------

	/**
	 * Start the idle timeout. If no new sessions are created before it fires,
	 * the daemon shuts down.
	 */
	private _startIdleTimer(): void {
		this._idleTimer = setTimeout(() => {
			if (this._sessions.size === 0) {
				this.stop().catch(() => {
					// Best-effort shutdown
				});
			}
		}, this._idleTimeout);
	}

	// -----------------------------------------------------------------------
	// Socket file management
	// -----------------------------------------------------------------------

	/**
	 * Remove a stale socket file if it exists and no process is listening.
	 */
	private async _cleanStaleSocket(): Promise<void> {
		try {
			await fs.access(this._socketPath);
			// Socket file exists — try to connect to see if it's stale
			const isAlive = await this._isSocketAlive();
			if (isAlive) {
				throw new DaemonError(
					`Another daemon is already listening on ${this._socketPath}. ` +
						'Stop it first with `cypress-cli stop`.',
				);
			}
			// Stale socket — remove it
			await fs.unlink(this._socketPath);
		} catch (err) {
			if (err instanceof DaemonError) {
				throw err;
			}
			// Only ignore "file not found" — rethrow permission/filesystem errors
			const nodeErr = err as NodeJS.ErrnoException;
			if (nodeErr.code === 'ENOENT') {
				return;
			}
			throw err;
		}
	}

	/**
	 * Check if something is already listening on the socket path.
	 */
	private _isSocketAlive(): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			const client = net.createConnection(this._socketPath);
			client.on('connect', () => {
				client.destroy();
				resolve(true);
			});
			client.on('error', () => {
				resolve(false);
			});
		});
	}

	/**
	 * Remove the socket file. Best-effort — ignores errors if file doesn't exist.
	 */
	private async _removeSocketFile(): Promise<void> {
		try {
			await fs.unlink(this._socketPath);
		} catch {
			// Socket file may not exist — that's fine
		}
	}
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Resolve the directory for socket files.
 * Prefers $XDG_RUNTIME_DIR, falls back to $TMPDIR, then os.tmpdir().
 */
export function resolveSocketDir(): string {
	const runtime = process.env['XDG_RUNTIME_DIR'];
	if (runtime) {
		return path.join(runtime, SOCKET_DIR_NAME);
	}
	const tmpdir = process.env['TMPDIR'] || os.tmpdir();
	return path.join(tmpdir, SOCKET_DIR_NAME);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Error thrown when a daemon operation fails.
 */
export class DaemonError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DaemonError';
	}
}
