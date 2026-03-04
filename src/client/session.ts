/**
 * Client session: connects to the daemon socket, sends commands, reads responses.
 *
 * A ClientSession is a thin wrapper over ClientSocketConnection that maps
 * ParsedCommand objects to protocol messages and returns typed results.
 * Each command is a one-shot operation: connect, send, receive, disconnect.
 *
 * Modeled after Playwright's Session.run() → SocketConnectionClient.sendAndClose().
 */

import path from 'node:path';
import os from 'node:os';

import {
	ClientSocketConnection,
	type ClientSocketOptions,
} from './socketConnection.js';
import type { ParsedCommand } from './command.js';
import type {
	CommandMessage,
	DaemonMessage,
} from '../daemon/protocol.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Subdirectory under the runtime dir for socket files. */
const SOCKET_DIR_NAME = 'cypress-cli';

// ---------------------------------------------------------------------------
// ClientSession
// ---------------------------------------------------------------------------

/**
 * A session for sending commands to the daemon.
 *
 * Usage:
 * ```ts
 * const session = new ClientSession('/tmp/cypress-cli/default.sock');
 * const response = await session.sendCommand(parsedCmd, rawArgs);
 * ```
 */
export class ClientSession {
	private _connection: ClientSocketConnection;
	private _messageId = 0;

	constructor(socketPath: string, options?: Partial<ClientSocketOptions>) {
		this._connection = new ClientSocketConnection({
			socketPath,
			...options,
		});
	}

	/**
	 * Send a parsed command to the daemon and return the response.
	 *
	 * @param parsedCommand - The validated command (from parseCommand)
	 * @param rawArgs - The raw minimist output (contains extra fields like `_`)
	 * @returns The daemon response (ResponseMessage or ErrorMessage)
	 */
	async sendCommand(
		parsedCommand: ParsedCommand,
		rawArgs: { _: string[]; [key: string]: unknown },
	): Promise<DaemonMessage> {
		const id = ++this._messageId;

		const message: CommandMessage = {
			id,
			method: parsedCommand.command === 'stop' ? 'stop' : 'run',
			params: {
				args: rawArgs,
			},
		};

		return this._connection.sendAndReceive(message);
	}

	/**
	 * Send a raw command (as string args) to the daemon.
	 * Used by the REPL mode.
	 *
	 * @param args - The command as an array of strings (e.g., ["click", "e5"])
	 * @returns The daemon response
	 */
	async sendRaw(args: string[]): Promise<DaemonMessage> {
		const id = ++this._messageId;

		const message: CommandMessage = {
			id,
			method: args[0] === 'stop' ? 'stop' : 'run',
			params: {
				args: { _: args },
			},
		};

		return this._connection.sendAndReceive(message);
	}

	/**
	 * Resolve the default socket path for a given session ID.
	 *
	 * @param sessionId - The session ID (defaults to "default")
	 * @returns Absolute path to the Unix socket
	 */
	static defaultSocketPath(sessionId: string = 'default'): string {
		const runtime = process.env['XDG_RUNTIME_DIR'];
		const baseDir = runtime
			? path.join(runtime, SOCKET_DIR_NAME)
			: path.join(process.env['TMPDIR'] || os.tmpdir(), SOCKET_DIR_NAME);
		return path.join(baseDir, `${sessionId}.sock`);
	}
}
