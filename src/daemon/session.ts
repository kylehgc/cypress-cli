/**
 * Session management for the daemon process.
 *
 * A Session represents a single Cypress browser session. It tracks state,
 * owns the command queue, and manages the Cypress child process lifecycle.
 *
 * State machine:
 *   waiting → running → paused ⇄ running → stopped
 *                  ↘ stopped
 */

import {
	CommandQueue,
	type QueuedCommand,
	type CommandResult,
} from './commandQueue.js';
import {
	CommandHistory,
	type HistoryEntry,
	type SerializedHistory,
} from './history.js';

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

/**
 * Session lifecycle states:
 * - `waiting`: session created, Cypress not yet started
 * - `running`: Cypress is running, commands can be executed
 * - `paused`: Cypress is running but command execution is paused
 * - `stopped`: session is terminated, no more commands accepted
 */
export type SessionState = 'waiting' | 'running' | 'paused' | 'stopped';

/**
 * Valid state transitions.
 * Maps each state to the set of states it can transition to.
 */
const VALID_TRANSITIONS: Record<SessionState, readonly SessionState[]> = {
	waiting: ['running', 'stopped'],
	running: ['paused', 'stopped'],
	paused: ['running', 'stopped'],
	stopped: [],
} as const;

// ---------------------------------------------------------------------------
// Session configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for creating a new session.
 */
export interface SessionConfig {
	/** Unique session identifier */
	id: string;
	/** Target URL to navigate to */
	url?: string;
	/** Browser to use (defaults to "chrome") */
	browser?: string;
	/** Whether to run in headed mode */
	headed?: boolean;
	/** Path to Cypress config file */
	configPath?: string;
}

/**
 * Serialized form of a session, suitable for JSON persistence.
 */
export interface SerializedSession {
	config: SessionConfig;
	createdAt: number;
	history: SerializedHistory;
}

// ---------------------------------------------------------------------------
// Session class
// ---------------------------------------------------------------------------

/**
 * A daemon session representing a single Cypress browser session.
 *
 * Manages:
 * - Session lifecycle state machine
 * - Command queue (pending → inflight → completed)
 * - Session metadata and configuration
 */
export class Session {
	private _state: SessionState = 'waiting';
	private _queue: CommandQueue;
	private _config: SessionConfig;
	private _createdAt: number;
	private _history: CommandHistory;

	constructor(config: SessionConfig) {
		this._config = Object.freeze({ ...config });
		this._queue = new CommandQueue();
		this._createdAt = Date.now();
		this._history = new CommandHistory();
	}

	// -----------------------------------------------------------------------
	// State management
	// -----------------------------------------------------------------------

	/**
	 * Current session state.
	 */
	get state(): SessionState {
		return this._state;
	}

	/**
	 * Transition to a new state.
	 *
	 * @param newState - The target state
	 * @throws {SessionError} If the transition is not valid
	 */
	transition(newState: SessionState): void {
		const allowed = VALID_TRANSITIONS[this._state];
		if (!allowed.includes(newState)) {
			throw new SessionError(
				`Invalid state transition: ${this._state} → ${newState}. ` +
					`Allowed transitions from "${this._state}": ${allowed.length > 0 ? allowed.join(', ') : 'none'}.`,
			);
		}
		this._state = newState;

		// Clean up when stopped
		if (newState === 'stopped') {
			this._queue.dispose();
		}
	}

	// -----------------------------------------------------------------------
	// Command queue delegation
	// -----------------------------------------------------------------------

	/**
	 * Enqueue a command for execution.
	 *
	 * @param command - The command to execute
	 * @returns A Promise that resolves when the command completes
	 * @throws {SessionError} If the session is not in a running state
	 */
	enqueueCommand(command: QueuedCommand): Promise<CommandResult> {
		if (this._state !== 'running') {
			throw new SessionError(
				`Cannot enqueue command: session is "${this._state}". ` +
					'Session must be in "running" state to accept commands.',
			);
		}
		return this._queue.enqueue(command);
	}

	/**
	 * Dequeue the next command (called by Cypress plugin).
	 *
	 * @returns A Promise resolving with the next command
	 * @throws {SessionError} If the session is not running
	 */
	dequeueCommand(): Promise<QueuedCommand> {
		if (this._state !== 'running') {
			throw new SessionError(
				`Cannot dequeue command: session is "${this._state}". ` +
					'Session must be in "running" state.',
			);
		}
		return this._queue.dequeue();
	}

	/**
	 * Report the result of the currently executing command.
	 *
	 * @param result - The command execution result
	 */
	reportResult(result: CommandResult): void {
		this._queue.reportResult(result);
	}

	/**
	 * Record a completed command and its result in the history.
	 * Used for codegen export and the `history` command.
	 */
	recordHistory(command: QueuedCommand, result: CommandResult): HistoryEntry {
		return this._history.append(command, result);
	}

	/**
	 * Undo the last command in the history.
	 *
	 * @returns The undone entry, or null if nothing to undo
	 */
	undoHistory(): HistoryEntry | null {
		return this._history.undo();
	}

	// -----------------------------------------------------------------------
	// Accessors
	// -----------------------------------------------------------------------

	/**
	 * Session configuration.
	 */
	get config(): SessionConfig {
		return this._config;
	}

	/**
	 * Unique session identifier.
	 */
	get id(): string {
		return this._config.id;
	}

	/**
	 * Timestamp when the session was created.
	 */
	get createdAt(): number {
		return this._createdAt;
	}

	/**
	 * The command queue for this session.
	 */
	get queue(): CommandQueue {
		return this._queue;
	}

	/**
	 * History of executed commands and their results.
	 */
	get commandHistory(): ReadonlyArray<{
		command: QueuedCommand;
		result: CommandResult;
	}> {
		return this._history.activeEntries;
	}

	/**
	 * The CommandHistory instance for this session.
	 */
	get history(): CommandHistory {
		return this._history;
	}

	/**
	 * Number of commands waiting in the queue.
	 */
	get pendingCount(): number {
		return this._queue.size;
	}

	/**
	 * Whether a command is currently being executed.
	 */
	get hasInflight(): boolean {
		return this._queue.hasInflight;
	}

	/**
	 * Serialize session state for persistence.
	 * Only the config and history are persisted — queue state is transient.
	 */
	serialize(): SerializedSession {
		return {
			config: { ...this._config },
			createdAt: this._createdAt,
			history: this._history.serialize(),
		};
	}

	/**
	 * Restore a session from serialized state.
	 *
	 * @param data - The serialized session object
	 * @returns A new Session with restored config and history
	 */
	static deserialize(data: SerializedSession): Session {
		const session = new Session(data.config);
		session._createdAt = data.createdAt;
		session._history = CommandHistory.deserialize(data.history);
		return session;
	}
}

// ---------------------------------------------------------------------------
// Session map
// ---------------------------------------------------------------------------

/**
 * Manages a collection of sessions indexed by their ID.
 * The daemon creates one SessionMap to track all active sessions.
 */
export class SessionMap {
	private _sessions = new Map<string, Session>();

	/**
	 * Create and register a new session.
	 *
	 * @param config - Session configuration
	 * @returns The newly created session
	 * @throws {SessionError} If a session with the same ID already exists
	 */
	create(config: SessionConfig): Session {
		if (this._sessions.has(config.id)) {
			throw new SessionError(
				`Session "${config.id}" already exists. Stop it first or use a different name.`,
			);
		}
		const session = new Session(config);
		this._sessions.set(config.id, session);
		return session;
	}

	/**
	 * Register an existing session instance (for restore/resume flows).
	 *
	 * @param session - The session instance to register
	 * @returns The registered session
	 * @throws {SessionError} If a session with the same ID already exists
	 */
	add(session: Session): Session {
		if (this._sessions.has(session.id)) {
			throw new SessionError(
				`Session "${session.id}" already exists. Stop it first or use a different name.`,
			);
		}
		this._sessions.set(session.id, session);
		return session;
	}

	/**
	 * Get a session by ID.
	 *
	 * @param id - Session identifier
	 * @returns The session, or undefined if not found
	 */
	get(id: string): Session | undefined {
		return this._sessions.get(id);
	}

	/**
	 * Remove a session from the map.
	 * Does NOT stop the session — call session.transition('stopped') first.
	 *
	 * @param id - Session identifier
	 * @returns True if the session was found and removed
	 */
	remove(id: string): boolean {
		return this._sessions.delete(id);
	}

	/**
	 * Check if a session exists.
	 */
	has(id: string): boolean {
		return this._sessions.has(id);
	}

	/**
	 * Number of active sessions.
	 */
	get size(): number {
		return this._sessions.size;
	}

	/**
	 * All session IDs.
	 */
	get ids(): string[] {
		return Array.from(this._sessions.keys());
	}

	/**
	 * Stop all sessions and clear the map.
	 */
	stopAll(): void {
		for (const session of this._sessions.values()) {
			if (session.state !== 'stopped') {
				session.transition('stopped');
			}
		}
		this._sessions.clear();
	}
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Error thrown when a session operation is invalid.
 */
export class SessionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SessionError';
	}
}
