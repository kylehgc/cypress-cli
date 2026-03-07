/**
 * Client session: discovers the daemon socket and sends commands.
 *
 * Handles socket path discovery via the standard runtime directory layout
 * and translates ParsedCommand into wire-format CommandMessage.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { resolveSocketDir } from '../daemon/daemon.js';
import {
	type CommandMessage,
	type DaemonMessage,
	isErrorMessage,
} from '../daemon/protocol.js';
import {
	sendAndReceive,
	ClientConnectionError,
	type ClientSocketOptions,
} from './socketConnection.js';
import type { ParsedCommand } from './command.js';

/** Default session name when none is specified via --session. */
export const DEFAULT_SESSION = 'default';

/**
 * Options for creating a ClientSession.
 */
export interface ClientSessionOptions {
	/** Session name (default: "default"). */
	session?: string;
	/** Override socket directory for testing. */
	socketDir?: string;
	/** Override the full socket path (bypasses discovery). */
	socketPath?: string;
	/** Response timeout in ms. */
	responseTimeout?: number;
	/** Connection timeout in ms. */
	connectTimeout?: number;
}

/**
 * Result from sending a command to the daemon.
 */
export interface ClientResult {
	/** Whether the command succeeded. */
	success: boolean;
	/** The response payload (snapshot, etc.). */
	result?: Record<string, unknown>;
	/** Error message if the command failed. */
	error?: string;
}

/**
 * Client session that connects to a daemon and sends commands.
 *
 * Handles socket path discovery and message ID generation.
 * Each sendCommand call opens a new connection, sends the command,
 * waits for the response, and disconnects.
 */
export class ClientSession {
	private _socketPath: string | null;
	private _socketDir: string;
	private _sessionName: string;
	private _nextId = 1;
	private _responseTimeout?: number;
	private _connectTimeout?: number;

	constructor(options: ClientSessionOptions = {}) {
		this._sessionName = options.session ?? DEFAULT_SESSION;
		this._socketDir = options.socketDir ?? resolveSocketDir();
		this._socketPath = options.socketPath ?? null;
		this._responseTimeout = options.responseTimeout;
		this._connectTimeout = options.connectTimeout;
	}

	/**
	 * Resolves the socket path for this session.
	 *
	 * @returns The path to the daemon socket file
	 * @throws {ClientConnectionError} If the socket file doesn't exist
	 */
	async resolveSocketPath(): Promise<string> {
		if (this._socketPath) {
			return this._socketPath;
		}

		const socketPath = path.join(
			this._socketDir,
			`${this._sessionName}.sock`,
		);

		try {
			await fs.access(socketPath);
		} catch {
			throw new ClientConnectionError(
				`No session "${this._sessionName}" found. ` +
					'Run `cypress-cli open <url>` to start a session.',
			);
		}

		return socketPath;
	}

	/**
	 * Sends a parsed command to the daemon and returns the result.
	 * Commands are sent one at a time; concurrent calls are not supported.
	 *
	 * @param parsed - The parsed and validated command
	 * @returns The command result
	 */
	async sendCommand(parsed: ParsedCommand): Promise<ClientResult> {
		const socketPath = await this.resolveSocketPath();

		const positionals = [parsed.command];

		// Reconstruct positional args from the parsed args
		const args = parsed.args as Record<string, unknown>;
		const options = parsed.options as Record<string, unknown>;

		// Build the positional args array based on command type
		for (const value of Object.values(args)) {
			if (value !== undefined) {
				positionals.push(String(value));
			}
		}

		const wireArgs: Record<string, unknown> = {
			_: positionals,
			...options,
		};

		const message: CommandMessage = {
			id: this._nextId++,
			method: parsed.command === 'stop' ? 'stop' : 'run',
			params: {
				args: wireArgs as CommandMessage['params']['args'],
			},
		};

		const socketOptions: ClientSocketOptions = {
			socketPath,
			...(this._responseTimeout !== undefined && {
				responseTimeout: this._responseTimeout,
			}),
			...(this._connectTimeout !== undefined && {
				connectTimeout: this._connectTimeout,
			}),
		};

		const response = await sendAndReceive(message, socketOptions);

		return toClientResult(response);
	}

	/**
	 * The session name.
	 */
	get sessionName(): string {
		return this._sessionName;
	}
}

/**
 * Converts a DaemonMessage to a ClientResult.
 */
function toClientResult(response: DaemonMessage): ClientResult {
	if (isErrorMessage(response)) {
		return {
			success: false,
			error: response.error,
		};
	}

	const result = response.result as unknown as Record<string, unknown>;

	const clientResult: ClientResult = {
		success: response.result.success,
		result,
	};

	if (
		!response.result.success &&
		'error' in response.result &&
		typeof (response.result as Record<string, unknown>).error === 'string'
	) {
		clientResult.error = (response.result as Record<string, unknown>).error as string;
	}

	return clientResult;
}
