/**
 * Client-side socket connection to the daemon.
 *
 * Handles:
 * - Connecting to the daemon's Unix domain socket
 * - Newline-delimited JSON framing (reuses daemon's SocketConnection)
 * - Reconnect logic with configurable retries
 * - Error framing with typed errors
 * - Send-and-receive pattern (one command at a time)
 *
 * Modeled after Playwright's SocketConnectionClient.
 */

import net from 'node:net';
import { StringDecoder } from 'node:string_decoder';

import {
	serializeMessage,
	deserializeMessage,
	type ProtocolMessage,
	type DaemonMessage,
	ProtocolError,
} from '../daemon/protocol.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default timeout for connecting to the daemon (ms). */
const DEFAULT_CONNECT_TIMEOUT = 5_000;

/** Default timeout for waiting for a response from the daemon (ms). */
const DEFAULT_RESPONSE_TIMEOUT = 300_000;

/** Default number of reconnect attempts. */
const DEFAULT_MAX_RETRIES = 2;

/** Delay between reconnect attempts (ms). */
const DEFAULT_RETRY_DELAY = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Options for creating a ClientSocketConnection.
 */
export interface ClientSocketOptions {
	/** Path to the Unix domain socket. */
	socketPath: string;
	/** Timeout for connecting (ms). */
	connectTimeout?: number;
	/** Timeout for waiting for a response (ms). */
	responseTimeout?: number;
	/** Maximum number of reconnect attempts. */
	maxRetries?: number;
	/** Delay between reconnect attempts (ms). */
	retryDelay?: number;
}

// ---------------------------------------------------------------------------
// ClientSocketConnection
// ---------------------------------------------------------------------------

/**
 * Client-side socket connection to the daemon.
 *
 * Provides a send-and-receive pattern: send a command, wait for the response,
 * then disconnect. The connection is not reused between commands.
 */
export class ClientSocketConnection {
	private _socketPath: string;
	private _connectTimeout: number;
	private _responseTimeout: number;
	private _maxRetries: number;
	private _retryDelay: number;

	constructor(options: ClientSocketOptions) {
		this._socketPath = options.socketPath;
		this._connectTimeout = options.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT;
		this._responseTimeout = options.responseTimeout ?? DEFAULT_RESPONSE_TIMEOUT;
		this._maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
		this._retryDelay = options.retryDelay ?? DEFAULT_RETRY_DELAY;
	}

	/**
	 * Send a protocol message and wait for a single response.
	 * Opens a new connection, sends the message, waits for the response,
	 * and closes the connection.
	 *
	 * @param message - The protocol message to send
	 * @returns The daemon's response message
	 * @throws {ClientConnectionError} If the connection fails after retries
	 * @throws {ClientTimeoutError} If the response doesn't arrive in time
	 */
	async sendAndReceive(message: ProtocolMessage): Promise<DaemonMessage> {
		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= this._maxRetries; attempt++) {
			try {
				return await this._attempt(message);
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));

				// Don't retry on timeout or protocol errors — only connection failures
				if (err instanceof ClientTimeoutError || err instanceof ProtocolError) {
					throw err;
				}

				// Wait before retrying (unless this was the last attempt)
				if (attempt < this._maxRetries) {
					await this._sleep(this._retryDelay);
				}
			}
		}

		throw new ClientConnectionError(
			`Failed to connect to daemon after ${this._maxRetries + 1} attempts. ` +
				`Socket: ${this._socketPath}. ` +
				`Last error: ${lastError?.message ?? 'unknown'}. ` +
				'Is the daemon running? Start a session with `cypress-cli open <url>`.',
		);
	}

	/**
	 * Single connection attempt: connect, send, receive, close.
	 */
	private async _attempt(message: ProtocolMessage): Promise<DaemonMessage> {
		const socket = await this._connect();

		try {
			return await this._sendAndWait(socket, message);
		} finally {
			socket.destroy();
		}
	}

	/**
	 * Connect to the daemon socket with a timeout.
	 */
	private _connect(): Promise<net.Socket> {
		return new Promise<net.Socket>((resolve, reject) => {
			const socket = net.createConnection(this._socketPath);

			const timer = setTimeout(() => {
				socket.destroy();
				reject(
					new ClientConnectionError(
						`Connection to daemon timed out after ${this._connectTimeout}ms. ` +
							`Socket: ${this._socketPath}.`,
					),
				);
			}, this._connectTimeout);

			socket.on('connect', () => {
				clearTimeout(timer);
				resolve(socket);
			});

			socket.on('error', (err: Error) => {
				clearTimeout(timer);
				reject(
					new ClientConnectionError(
						`Cannot connect to daemon: ${err.message}. ` +
							`Socket: ${this._socketPath}. ` +
							'Is the daemon running? Start a session with `cypress-cli open <url>`.',
					),
				);
			});
		});
	}

	/**
	 * Send a message over an established socket and wait for a response.
	 */
	private _sendAndWait(
		socket: net.Socket,
		message: ProtocolMessage,
	): Promise<DaemonMessage> {
		return new Promise<DaemonMessage>((resolve, reject) => {
			let buffer = '';
			const decoder = new StringDecoder('utf-8');

			const timer = setTimeout(() => {
				reject(
					new ClientTimeoutError(
						`No response from daemon within ${this._responseTimeout}ms. ` +
							'The command may still be running in Cypress.',
					),
				);
			}, this._responseTimeout);

			socket.on('data', (chunk: Buffer | string) => {
				const decoded = typeof chunk === 'string' ? chunk : decoder.write(chunk);
				buffer += decoded;

				const newlineIndex = buffer.indexOf('\n');
				if (newlineIndex !== -1) {
					clearTimeout(timer);
					const line = buffer.slice(0, newlineIndex);

					try {
						const response = deserializeMessage(line);
						resolve(response as DaemonMessage);
					} catch (err) {
						reject(err instanceof Error ? err : new Error(String(err)));
					}
				}
			});

			socket.on('error', (err: Error) => {
				clearTimeout(timer);
				reject(
					new ClientConnectionError(
						`Socket error during command: ${err.message}`,
					),
				);
			});

			socket.on('close', () => {
				clearTimeout(timer);
				// If we haven't resolved yet, the daemon closed without responding
				reject(
					new ClientConnectionError(
						'Daemon closed the connection without responding.',
					),
				);
			});

			// Send the message
			const serialized = serializeMessage(message);
			socket.write(serialized);
		});
	}

	/**
	 * Sleep for a given duration.
	 */
	private _sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Error thrown when the client cannot connect to the daemon.
 */
export class ClientConnectionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ClientConnectionError';
	}
}

/**
 * Error thrown when the daemon does not respond within the timeout.
 */
export class ClientTimeoutError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ClientTimeoutError';
	}
}
