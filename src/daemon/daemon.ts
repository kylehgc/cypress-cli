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

import { SocketConnection } from './connection.js';
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
	type InterceptEntry,
} from './session.js';
import type { QueuedCommand, CommandResult } from './commandQueue.js';
import { generateTestFile } from '../codegen/codegen.js';

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
			await this._removeSocketFile();
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
			this._handleHistory(conn, message);
			return;
		}

		if (action === 'undo') {
			this._handleUndo(conn, message);
			return;
		}

		if (action === 'status') {
			this._handleStatus(conn, message);
			return;
		}

		if (action === 'export') {
			this._handleExport(conn, message);
			return;
		}

		if (action === 'intercept-list') {
			this._handleInterceptList(conn, message);
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
						snapshotFile = await this._writeSnapshotFile(
							result.snapshot,
							snapshotFilename,
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
	 * Handle the "status" command: report whether a session is running.
	 * This is a daemon-local command — it does not go through Cypress.
	 */
	private _handleStatus(conn: SocketConnection, message: CommandMessage): void {
		const session = this._findPrimarySession();
		const response: ResponseMessage = {
			id: message.id,
			result: {
				success: true,
				...(session
					? {
							status: session.state,
							sessionId: session.id,
							url: session.config.url,
							browser: session.config.browser,
							headed: session.config.headed,
						}
					: {
							status: 'stopped',
						}),
			},
		};
		conn.send(response);
	}

	/**
	 * Handle the "history" command: return all executed commands with timestamps.
	 * This is a daemon-local command — it does not go through Cypress.
	 */
	private _handleHistory(
		conn: SocketConnection,
		message: CommandMessage,
	): void {
		const session = this._findRunningSession();
		if (!session) {
			const errorMsg: ErrorMessage = {
				id: message.id,
				error: 'No session running. Run `cypress-cli open <url>` to start one.',
			};
			conn.send(errorMsg);
			return;
		}

		const entries = session.history.entries;
		const formatted = entries.map((entry) => ({
			index: entry.index,
			action: entry.command.action,
			ref: entry.command.ref,
			text: entry.command.text,
			executedAt: entry.executedAt,
			success: entry.result.success,
			active: entry.index < session.history.undoIndex,
		}));

		const response: ResponseMessage = {
			id: message.id,
			result: {
				success: true,
				snapshot: JSON.stringify(formatted),
			},
		};
		conn.send(response);
	}

	/**
	 * Handle the "undo" command: remove the last command from export history.
	 * This is a daemon-local command — it does not go through Cypress.
	 */
	private _handleUndo(conn: SocketConnection, message: CommandMessage): void {
		const session = this._findRunningSession();
		if (!session) {
			const errorMsg: ErrorMessage = {
				id: message.id,
				error: 'No session running. Run `cypress-cli open <url>` to start one.',
			};
			conn.send(errorMsg);
			return;
		}

		const undone = session.undoHistory();
		if (!undone) {
			const errorMsg: ErrorMessage = {
				id: message.id,
				error: 'Cannot undo: history is empty. Execute a command first.',
			};
			conn.send(errorMsg);
			return;
		}

		const response: ResponseMessage = {
			id: message.id,
			result: {
				success: true,
				snapshot: `Undone: ${undone.command.action}${undone.command.ref ? ' ' + undone.command.ref : ''}`,
			},
		};
		conn.send(response);
	}

	/**
	 * Handle the "export" daemon-local command: generate a Cypress test file
	 * from the session's command history without round-tripping through Cypress.
	 */
	private async _handleExport(
		conn: SocketConnection,
		message: CommandMessage,
	): Promise<void> {
		const session = this._findRunningSession();
		if (!session) {
			const errorMsg: ErrorMessage = {
				id: message.id,
				error: 'No session running. Run `cypress-cli open <url>` to start one.',
			};
			conn.send(errorMsg);
			return;
		}

		const options = stripPositionals(message.params.args);

		try {
			const format = inferExportFormat(options);
			const testFile = generateTestFile(session.commandHistory, {
				describeName: options.describe as string | undefined,
				itName: options.it as string | undefined,
				format,
				baseUrl: options.baseUrl as string | undefined,
			});
			const filePath =
				typeof options.file === 'string' && options.file.length > 0
					? options.file
					: undefined;

			if (filePath) {
				await fs.mkdir(path.dirname(filePath), { recursive: true });
				await fs.writeFile(filePath, testFile, 'utf-8');
			}

			const response: ResponseMessage = {
				id: message.id,
				result: {
					success: true,
					testFile,
					...(filePath !== undefined && { filePath }),
				},
			};
			conn.send(response);
		} catch (err) {
			const errorMsg: ErrorMessage = {
				id: message.id,
				error: err instanceof Error ? err.message : String(err),
			};
			conn.send(errorMsg);
		}
	}

	/**
	 * Handle the "intercept-list" command: return all active route mocks.
	 * This is a daemon-local command — it does not go through Cypress.
	 */
	private _handleInterceptList(
		conn: SocketConnection,
		message: CommandMessage,
	): void {
		const session = this._findRunningSession();
		if (!session) {
			const errorMsg: ErrorMessage = {
				id: message.id,
				error: 'No session running. Run `cypress-cli open <url>` to start one.',
			};
			conn.send(errorMsg);
			return;
		}

		const intercepts = session.intercepts;
		const response: ResponseMessage = {
			id: message.id,
			result: {
				success: true,
				evalResult: JSON.stringify(intercepts, null, 2),
			},
		};
		conn.send(response);
	}

	/**
	 * Track intercept/unintercept state in the session registry.
	 * Called after a successful command execution.
	 */
	private _trackInterceptState(session: Session, command: QueuedCommand): void {
		if (command.action === 'intercept' && command.text) {
			const entry: InterceptEntry = {
				pattern: command.text,
				...(command.options?.['status'] !== undefined && {
					statusCode: Number(command.options['status']),
				}),
				...(typeof command.options?.['body'] === 'string' && {
					body: command.options['body'] as string,
				}),
				...(typeof command.options?.['content-type'] === 'string' && {
					contentType: command.options['content-type'] as string,
				}),
			};
			session.addIntercept(entry);
		} else if (command.action === 'unintercept') {
			session.removeIntercept(command.text || undefined);
		}
	}

	/**
	 * Check for drift between the daemon's intercept registry and the
	 * driver's actual active route count reported in evalResult.
	 *
	 * Only runs for the commands that intentionally report `activeRouteCount`
	 * in their response: `network`, `intercept`, and `unintercept`. Guarding
	 * by action prevents false positives when an arbitrary `eval` command
	 * happens to return an object with an `activeRouteCount` key.
	 */
	private _checkInterceptDrift(
		session: Session,
		command: QueuedCommand,
		result: CommandResult,
	): void {
		const DRIFT_TRACKED_ACTIONS = new Set(['network', 'intercept', 'unintercept']);
		if (!DRIFT_TRACKED_ACTIONS.has(command.action)) return;

		if (!result.evalResult) return;

		try {
			const parsed = JSON.parse(result.evalResult) as Record<string, unknown>;
			const driverCount = parsed['activeRouteCount'];
			if (typeof driverCount !== 'number') return;

			const daemonCount = session.intercepts.length;
			if (driverCount !== daemonCount) {
				// Drift detected — if driver has fewer routes than daemon,
				// remove excess daemon entries (most likely cause: socket
				// drop during unintercept lost the confirmation).
				if (driverCount === 0 && daemonCount > 0) {
					session.removeIntercept();
				}
				// Note: if driver has MORE routes than daemon, we cannot
				// reconstruct the missing entries without querying the
				// driver. This is a safety net, not full reconciliation.
			}
		} catch {
			// evalResult is not JSON or doesn't have the expected shape — ignore
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

	// -----------------------------------------------------------------------
	// Snapshot file output
	// -----------------------------------------------------------------------

	/**
	 * Write a snapshot YAML string to a file in the snapshot directory.
	 *
	 * @param snapshot - The YAML snapshot content
	 * @param filename - Optional explicit filename; if not provided, generates
	 *   `page-<ISO-timestamp>.yml`
	 * @returns The relative file path of the written snapshot
	 */
	private async _writeSnapshotFile(
		snapshot: string,
		filename?: string,
	): Promise<string> {
		const baseDir = path.resolve(this._snapshotDir);
		const name =
			filename ?? `page-${new Date().toISOString().replace(/[:.]/g, '-')}.yml`;

		// Reject absolute paths in filename to prevent escaping snapshotDir
		if (path.isAbsolute(name)) {
			throw new Error(
				`Invalid snapshot filename "${name}": absolute paths are not allowed`,
			);
		}

		const filePath = path.resolve(baseDir, name);

		// Reject path traversal (e.g. "../outside/file.yml") using path.relative
		// to avoid platform-specific separator normalization issues.
		const relative = path.relative(baseDir, filePath);
		if (relative.startsWith('..') || path.isAbsolute(relative)) {
			throw new Error(
				`Invalid snapshot filename "${name}": path traversal is not allowed`,
			);
		}

		// Ensure the directory for the resolved path exists (handles nested filenames)
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, snapshot, 'utf-8');
		return path.relative(process.cwd(), filePath);
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
		} catch (err) {
			const nodeErr = err as NodeJS.ErrnoException;
			if (nodeErr.code === 'ENOENT') {
				// Socket file may not exist — that's fine
				return;
			}
			throw err;
		}
	}
}

function inferExportFormat(options: Record<string, unknown>): 'js' | 'ts' {
	if (options.format === 'js' || options.format === 'ts') {
		return options.format;
	}

	if (typeof options.file === 'string') {
		if (options.file.endsWith('.ts')) {
			return 'ts';
		}
		if (options.file.endsWith('.js')) {
			return 'js';
		}
	}

	return 'ts';
}

function buildQueuedCommand(
	id: number,
	args: CommandMessage['params']['args'],
): QueuedCommand {
	const [action, ...positionals] = args._;
	const options = stripPositionals(args);

	switch (action) {
		case 'click':
		case 'dblclick':
		case 'rightclick':
		case 'clear':
		case 'check':
		case 'uncheck':
		case 'focus':
		case 'blur':
		case 'hover':
		case 'waitfor':
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && { ref: positionals[0] }),
				},
				options,
			);
		case 'type':
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && { ref: positionals[0] }),
					...(joinText(positionals.slice(1)) !== undefined && {
						text: joinText(positionals.slice(1)),
					}),
				},
				options,
			);
		case 'fill':
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && { ref: positionals[0] }),
					...(joinText(positionals.slice(1)) !== undefined && {
						text: joinText(positionals.slice(1)),
					}),
				},
				options,
			);
		case 'select':
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && { ref: positionals[0] }),
					...(joinText(positionals.slice(1)) !== undefined && {
						text: joinText(positionals.slice(1)),
					}),
				},
				options,
			);
		case 'scrollto':
			if (positionals[0] && looksLikeRef(positionals[0])) {
				return withOptions({ id, action, ref: positionals[0] }, options);
			}
			return withOptions(
				{
					id,
					action,
					...(joinText(positionals) !== undefined && {
						text: joinText(positionals),
					}),
				},
				options,
			);
		case 'navigate': {
			const navigateText = joinText(stripPlaceholder(positionals));
			return withOptions(
				{
					id,
					action,
					...(navigateText !== undefined && {
						text: navigateText,
					}),
				},
				options,
			);
		}
		case 'back':
		case 'forward':
		case 'reload':
		case 'snapshot':
			return withOptions({ id, action }, options);
		case 'press':
		case 'wait':
		case 'run-code':
			return withOptions(
				{
					id,
					action,
					...(joinText(positionals) !== undefined && {
						text: joinText(positionals),
					}),
				},
				options,
			);
		case 'eval': {
			const lastToken = positionals[positionals.length - 1];
			const hasTrailingRef =
				positionals.length >= 2 &&
				lastToken !== undefined &&
				looksLikeRef(lastToken);
			const exprParts = hasTrailingRef ? positionals.slice(0, -1) : positionals;
			const exprText = joinText(exprParts);
			return withOptions(
				{
					id,
					action,
					...(exprText !== undefined && { text: exprText }),
					...(hasTrailingRef && { ref: lastToken }),
				},
				options,
			);
		}
		case 'assert': {
			const legacyChainer =
				typeof options['chainer'] === 'string' ? options['chainer'] : undefined;
			const [ref, second, ...rest] = positionals;
			const chainer = legacyChainer ?? second;
			const valueParts = legacyChainer ? [second, ...rest] : rest;
			return withOptions(
				{
					id,
					action,
					...(ref !== undefined && { ref }),
					...(joinText(valueParts) !== undefined && {
						text: joinText(valueParts),
					}),
				},
				{
					...options,
					...(chainer !== undefined && { chainer }),
				},
			);
		}
		case 'asserturl':
		case 'asserttitle': {
			const legacyChainer =
				typeof options['chainer'] === 'string' ? options['chainer'] : undefined;
			const normalized = stripPlaceholder(positionals);
			const [second, ...rest] = normalized;
			const chainer = legacyChainer ?? second;
			const valueParts = legacyChainer ? normalized : rest;
			return withOptions(
				{
					id,
					action,
					...(joinText(valueParts) !== undefined && {
						text: joinText(valueParts),
					}),
				},
				{
					...options,
					...(chainer !== undefined && { chainer }),
				},
			);
		}
		case 'network':
			return withOptions({ id, action }, options);
		case 'intercept':
			// Pattern is the first positional, stored in `text` for the driver
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && {
						text: positionals[0],
					}),
				},
				options,
			);
		case 'unintercept':
			// Optional pattern is the first positional, stored in `text`
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && {
						text: positionals[0],
					}),
				},
				options,
			);
		case 'waitforresponse':
			// Pattern is the first positional, stored in `text`
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && {
						text: positionals[0],
					}),
				},
				options,
			);
		case 'dialog-accept':
			return withOptions(
				{
					id,
					action,
					...(joinText(positionals) !== undefined && {
						text: joinText(positionals),
					}),
				},
				options,
			);
		case 'dialog-dismiss':
			return withOptions({ id, action }, options);
		case 'resize':
			return withOptions(
				{ id, action },
				{
					...options,
					...(positionals[0] !== undefined && {
						width: positionals[0],
					}),
					...(positionals[1] !== undefined && {
						height: positionals[1],
					}),
				},
			);
		case 'screenshot':
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && { ref: positionals[0] }),
				},
				options,
			);
		case 'drag':
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && { ref: positionals[0] }),
					...(positionals[1] !== undefined && { text: positionals[1] }),
				},
				options,
			);
		case 'upload': {
			const filePath = joinText(positionals.slice(1));
			if (filePath !== undefined) {
				const resolved = path.resolve(filePath);
				const cwd = process.cwd();
				if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
					throw new Error(
						`Upload path "${filePath}" resolves outside the working directory. ` +
							'Use a relative path within the project.',
					);
				}
			}
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && { ref: positionals[0] }),
					...(filePath !== undefined && { text: filePath }),
				},
				options,
			);
		}
		default:
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && { ref: positionals[0] }),
					...(joinText(positionals.slice(1)) !== undefined && {
						text: joinText(positionals.slice(1)),
					}),
				},
				options,
			);
	}
}

function stripPositionals(
	args: CommandMessage['params']['args'],
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(args).filter(([key]) => key !== '_'),
	);
}

function withOptions(
	command: QueuedCommand,
	options: Record<string, unknown>,
): QueuedCommand {
	return Object.keys(options).length > 0
		? {
				...command,
				options,
			}
		: command;
}

function joinText(parts: string[]): string | undefined {
	const text = parts.join(' ').trim();
	return text.length > 0 ? text : undefined;
}

function stripPlaceholder(parts: string[]): string[] {
	return parts[0] === '_' ? parts.slice(1) : parts;
}

function looksLikeRef(value: string): boolean {
	return /^e\d+$/.test(value);
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

/**
 * Test whether something is listening on a Unix socket.
 *
 * @param socketPath - Absolute path to the socket file
 * @returns `true` if a connection was established (socket is alive)
 */
export function isSocketAlive(socketPath: string): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		const client = net.createConnection(socketPath);
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
 * Scan the socket directory for stale `.sock` files left behind by dead
 * daemons and remove them. Live sockets (where a daemon is still listening)
 * are left untouched.
 *
 * @param socketDir - Override socket directory (for testing). Defaults to the
 *   standard runtime directory.
 * @returns Session IDs whose stale sockets were cleaned up
 */
export async function cleanStaleSockets(socketDir?: string): Promise<string[]> {
	const dir = socketDir ?? resolveSocketDir();
	const cleaned: string[] = [];

	let entries: string[];
	try {
		entries = await fs.readdir(dir);
	} catch {
		// Directory may not exist yet — nothing to clean
		return cleaned;
	}

	for (const entry of entries) {
		if (!entry.endsWith('.sock')) continue;
		const fullPath = path.join(dir, entry);

		const alive = await isSocketAlive(fullPath);
		if (!alive) {
			try {
				await fs.unlink(fullPath);
				cleaned.push(entry.replace('.sock', ''));
			} catch {
				// Best-effort — ignore errors on individual files
			}
		}
	}

	return cleaned;
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
