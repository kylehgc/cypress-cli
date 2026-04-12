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

import { SocketConnection } from './connection.js';
import {
	type CommandMessage,
	type ProtocolMessage,
	type ResponseMessage,
	type ErrorMessage,
} from './protocol.js';
import { SessionMap, Session, type SessionConfig } from './session.js';
import type { QueuedCommand, CommandResult } from './commandQueue.js';
import { buildQueuedCommand } from './commandBuilder.js';
import {
	handleStatus,
	handleHistory,
	handleUndo,
	handleExport,
	handleInterceptList,
	handleRunTest,
	trackInterceptState,
	checkInterceptDrift,
} from './handlers.js';
import { writeSnapshotFile } from './snapshotFiles.js';
import {
	resolveSocketDir,
	ensureSocketAvailable,
	removeSocketFile,
} from './socketUtils.js';
import { DaemonError } from './errors.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default idle timeout (in ms) before the daemon auto-exits after the last
 * session closes. 0 means no auto-exit.
 */
const DEFAULT_IDLE_TIMEOUT = 30_000;

/**
 * Default session inactivity timeout (in ms). The daemon auto-exits when
 * no client sends a command within this window — even if a session is still
 * nominally "running". This prevents detached daemons from being orphaned.
 * 0 means no inactivity auto-exit.
 */
const DEFAULT_SESSION_INACTIVITY_TIMEOUT = 0; // disabled by default

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
	/**
	 * Session inactivity timeout in ms. Daemon auto-exits when no client
	 * command is received within this window, even if a session is still open.
	 * 0 = no inactivity auto-exit.
	 */
	sessionInactivityTimeout?: number;
	/** Override the socket directory path (for testing). */
	socketDir?: string;
	/** Directory to write snapshot YAML files. Defaults to `.cypress-cli/` in cwd. */
	snapshotDir?: string;
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
	private _sessionInactivityTimeout: number;
	private _inactivityTimer: ReturnType<typeof setTimeout> | null = null;
	private _connections = new Set<SocketConnection>();
	private _isShuttingDown = false;
	private _stopPromise: Promise<void> | null = null;
	private _snapshotDir: string;

	constructor(options: DaemonOptions) {
		this._sessions = new SessionMap();
		this._idleTimeout = options.idleTimeout ?? DEFAULT_IDLE_TIMEOUT;
		this._sessionInactivityTimeout =
			options.sessionInactivityTimeout ?? DEFAULT_SESSION_INACTIVITY_TIMEOUT;
		this._socketDir = options.socketDir ?? resolveSocketDir();
		this._socketPath = path.join(this._socketDir, `${options.sessionId}.sock`);
		this._snapshotDir =
			options.snapshotDir ?? path.join(process.cwd(), '.cypress-cli');
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
		// Ensure the socket directory exists with restrictive permissions
		// so only the current user can access the socket
		await fs.mkdir(this._socketDir, { recursive: true, mode: 0o700 });

		// Clean up stale socket file if present
		await ensureSocketAvailable(this._socketPath);

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
		// If already shutting down, return the existing promise so concurrent
		// callers can await the same shutdown work completing.
		if (this._stopPromise) {
			return this._stopPromise;
		}

		this._isShuttingDown = true;

		this._stopPromise = (async () => {
			// Clear idle timer
			if (this._idleTimer) {
				clearTimeout(this._idleTimer);
				this._idleTimer = null;
			}

			// Clear inactivity timer
			if (this._inactivityTimer) {
				clearTimeout(this._inactivityTimer);
				this._inactivityTimer = null;
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
			await removeSocketFile(this._socketPath);
		})();

		return this._stopPromise;
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
		// Start or reset the inactivity timer
		this._resetInactivityTimer();
		return session;
	}

	/**
	 * Register a restored session instance with the daemon.
	 *
	 * @param session - The restored session
	 * @returns The registered session
	 */
	registerSession(session: Session): Session {
		const registered = this._sessions.add(session);
		if (this._idleTimer) {
			clearTimeout(this._idleTimer);
			this._idleTimer = null;
		}
		// Start or reset the inactivity timer
		this._resetInactivityTimer();
		return registered;
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
			if (this._idleTimer) {
				clearTimeout(this._idleTimer);
				this._idleTimer = null;
			}
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

	/**
	 * The snapshot output directory.
	 */
	get snapshotDir(): string {
		return this._snapshotDir;
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
		this._touchActivity();

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
		this._touchActivity();
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

		// Handle daemon-local commands that don't need Cypress round-trip
		if (action === 'history') {
			handleHistory(conn, message, this._findRunningSession());
			return;
		}

		if (action === 'undo') {
			handleUndo(conn, message, this._findRunningSession());
			return;
		}

		if (action === 'status') {
			handleStatus(conn, message, this._findPrimarySession());
			return;
		}

		if (action === 'export') {
			void handleExport(conn, message, this._findRunningSession());
			return;
		}

		if (action === 'intercept-list') {
			handleInterceptList(conn, message, this._findRunningSession());
			return;
		}

		if (action === 'run') {
			void handleRunTest(conn, message, this._findRunningSession());
			return;
		}

		let command: QueuedCommand;
		try {
			command = buildQueuedCommand(message.id, message.params.args);
		} catch (err) {
			const errorMsg: ErrorMessage = {
				id: message.id,
				error: err instanceof Error ? err.message : String(err),
			};
			conn.send(errorMsg);
			return;
		}

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

		// state-load: read file from disk and attach data to command options
		if (action === 'state-load') {
			const filename = command.text;
			if (!filename) {
				const errorMsg: ErrorMessage = {
					id: message.id,
					error: 'state-load requires a filename argument.',
				};
				conn.send(errorMsg);
				return;
			}
			this._handleStateLoad(conn, message, command, session, filename);
			return;
		}

		const snapshotFilename =
			typeof command.options?.['filename'] === 'string'
				? command.options['filename']
				: undefined;

		try {
			session
				.enqueueCommand(command)
				.then(async (result: CommandResult) => {
					// Client may have disconnected while the command was running
					if (conn.isClosed) return;

					// Record in history
					session.recordHistory(command, result);

					// Track intercept state in daemon registry
					if (result.success) {
						this._trackInterceptState(session, command);
					}

					// Detect intercept state drift between daemon and driver
					this._checkInterceptDrift(session, command, result);

					// Write snapshot to file if present
					let snapshotFile: string | undefined;
					if (result.snapshot) {
						snapshotFile = await writeSnapshotFile(
							this._snapshotDir,
							result.snapshot,
							snapshotFilename,
						);
					}

					// state-save: write evalResult (state JSON) to a file
					let stateFilePath: string | undefined;
					if (action === 'state-save' && result.success && result.evalResult) {
						const stateFilename =
							typeof command.options?.['filename'] === 'string'
								? command.options['filename']
								: undefined;
						stateFilePath = await this._writeStateFile(
							result.evalResult,
							stateFilename,
						);
					}

					// Send result back to client
					const response: ResponseMessage = {
						id: message.id,
						result: {
							success: result.success,
							...(result.snapshot !== undefined && {
								snapshot: result.snapshot,
							}),
							...(result.error !== undefined && {
								error: result.error,
							}),
							...(result.selector !== undefined && {
								selector: result.selector,
							}),
							...(result.cypressCommand !== undefined && {
								cypressCommand: result.cypressCommand,
							}),
							...(result.evalResult !== undefined && {
								evalResult: result.evalResult,
							}),
							...(snapshotFile !== undefined && {
								snapshotFilePath: snapshotFile,
							}),
							...(stateFilePath !== undefined && {
								filePath: stateFilePath,
							}),
							...(result.url !== undefined && {
								url: result.url,
							}),
							...(result.title !== undefined && {
								title: result.title,
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

	private _findPrimarySession(): Session | undefined {
		const [firstId] = this._sessions.ids;
		return firstId ? this._sessions.get(firstId) : undefined;
	}

	private _trackInterceptState(session: Session, command: QueuedCommand): void {
		trackInterceptState(session, command);
	}

	private _checkInterceptDrift(
		session: Session,
		command: QueuedCommand,
		result: CommandResult,
	): void {
		checkInterceptDrift(session, command, result);
	}

	/**
	 * Write browser state JSON to a file inside the snapshot directory.
	 *
	 * @param stateJson - The JSON string containing browser state
	 * @param filename - Optional explicit filename; defaults to `state.json`
	 * @returns The relative file path of the written state file
	 */
	private async _writeStateFile(
		stateJson: string,
		filename?: string,
	): Promise<string> {
		const baseDir = path.resolve(this._snapshotDir);
		const name = filename ?? 'state.json';

		if (path.isAbsolute(name)) {
			throw new Error(
				`Invalid state filename "${name}": absolute paths are not allowed`,
			);
		}

		const filePath = path.resolve(baseDir, name);

		const relative = path.relative(baseDir, filePath);
		if (relative.startsWith('..') || path.isAbsolute(relative)) {
			throw new Error(
				`Invalid state filename "${name}": path traversal is not allowed`,
			);
		}

		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, stateJson, 'utf-8');
		return path.relative(process.cwd(), filePath);
	}

	/**
	 * Handle the state-load command: read the state file from disk, validate it,
	 * and forward the state data to Cypress for restoration.
	 */
	private async _handleStateLoad(
		conn: SocketConnection,
		message: CommandMessage,
		command: QueuedCommand,
		session: Session,
		filename: string,
	): Promise<void> {
		try {
			const baseDir = path.resolve(this._snapshotDir);

			// Reject absolute paths to prevent reading arbitrary files
			if (path.isAbsolute(filename)) {
				const errorMsg: ErrorMessage = {
					id: message.id,
					error: `Absolute paths are not allowed for state-load: "${filename}"`,
				};
				conn.send(errorMsg);
				return;
			}

			// Resolve the filename:
			// - Relative paths are first resolved from process.cwd().
			// - Bare filenames (no path separators) are also tried within the snapshot dir.
			const candidatePaths: string[] = [];

			// First, treat as relative to the current working directory
			candidatePaths.push(path.resolve(process.cwd(), filename));

			// If this is a bare filename (no directory components),
			// also try resolving within the snapshot directory.
			if (!filename.includes(path.sep) && !filename.includes('/')) {
				candidatePaths.push(path.resolve(baseDir, filename));
			}

			let stateJson: string | undefined;

			for (const filePath of candidatePaths) {
				// Validate that the resolved path does not escape the allowed directories
				// via path traversal (e.g. "../secrets.json")
				const relativeToBase = path.relative(baseDir, filePath);
				const relativeToCwd = path.relative(process.cwd(), filePath);
				const withinBase =
					!relativeToBase.startsWith('..') && !path.isAbsolute(relativeToBase);
				const withinCwd =
					!relativeToCwd.startsWith('..') && !path.isAbsolute(relativeToCwd);

				if (!withinBase && !withinCwd) {
					continue;
				}

				try {
					stateJson = await fs.readFile(filePath, 'utf-8');
					break;
				} catch (err) {
					const nodeErr = err as NodeJS.ErrnoException;
					if (nodeErr.code !== 'ENOENT') {
						throw err;
					}
				}
			}

			if (stateJson === undefined) {
				const errorMsg: ErrorMessage = {
					id: message.id,
					error: `State file not found: "${filename}"`,
				};
				conn.send(errorMsg);
				return;
			}

			// Validate JSON
			try {
				JSON.parse(stateJson);
			} catch {
				const errorMsg: ErrorMessage = {
					id: message.id,
					error: `Invalid JSON in state file: "${filename}"`,
				};
				conn.send(errorMsg);
				return;
			}

			// Attach state data to command options for Cypress
			const loadCommand: QueuedCommand = {
				...command,
				options: {
					...command.options,
					stateData: stateJson,
				},
			};

			session
				.enqueueCommand(loadCommand)
				.then(async (result: CommandResult) => {
					if (conn.isClosed) return;

					session.recordHistory(loadCommand, result);

					const response: ResponseMessage = {
						id: message.id,
						result: {
							success: result.success,
							...(result.error !== undefined && {
								error: result.error,
							}),
							...(result.evalResult !== undefined && {
								evalResult: result.evalResult,
							}),
							...(result.url !== undefined && {
								url: result.url,
							}),
							...(result.title !== undefined && {
								title: result.title,
							}),
						},
					};
					conn.send(response);
				})
				.catch((err: Error) => {
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
	// Session inactivity timer
	// -----------------------------------------------------------------------

	/**
	 * Record client activity and reset the inactivity timer.
	 * Called on every new connection and every incoming message.
	 */
	private _touchActivity(): void {
		this._resetInactivityTimer();
	}

	/**
	 * (Re)start the inactivity timer. When it fires, the daemon auto-exits
	 * to prevent orphaned processes when the CLI client is gone.
	 */
	private _resetInactivityTimer(): void {
		if (this._sessionInactivityTimeout <= 0) {
			return;
		}
		if (this._inactivityTimer) {
			clearTimeout(this._inactivityTimer);
			this._inactivityTimer = null;
		}
		this._inactivityTimer = setTimeout(() => {
			this.stop().catch(() => {
				// Best-effort shutdown
			});
		}, this._sessionInactivityTimeout);
	}
}

export { buildQueuedCommand } from './commandBuilder.js';
export {
	resolveSocketDir,
	isSocketAlive,
	cleanStaleSockets,
} from './socketUtils.js';
export { DaemonError } from './errors.js';
