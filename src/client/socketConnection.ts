/**
 * Client-side socket connection for communicating with the daemon.
 *
 * Connects to the daemon's Unix domain socket, sends a command,
 * waits for the response, and disconnects. Uses the same newline-delimited
 * JSON protocol as the daemon's SocketConnection.
 */

import net from 'node:net';
import { StringDecoder } from 'node:string_decoder';

import {
	serializeMessage,
	deserializeMessage,
	type CommandMessage,
	type DaemonMessage,
} from '../daemon/protocol.js';

/**
 * Default timeout (ms) waiting for a response from the daemon.
 * Cypress commands can take tens of seconds to execute (navigation, assertions
 * with retries), and the daemon waits for cy.task() round-trips that include
 * a 110s long-poll timeout, so 120s is appropriate here.
 */
const DEFAULT_RESPONSE_TIMEOUT = 120_000;

/** Default connection timeout (ms) for establishing the socket connection. */
const DEFAULT_CONNECT_TIMEOUT = 5_000;

/** Default number of reconnect attempts before giving up. */
const DEFAULT_MAX_RETRIES = 2;

/** Delay (ms) between reconnect attempts. */
const RETRY_DELAY = 500;

/**
 * Options for the client socket connection.
 */
export interface ClientSocketOptions {
	/** Path to the Unix domain socket. */
	socketPath: string;
	/** Timeout in ms waiting for a response. */
	responseTimeout?: number;
	/** Timeout in ms for establishing the connection. */
	connectTimeout?: number;
	/** Maximum number of reconnect attempts on connection failure. */
	maxRetries?: number;
}

/**
 * Connects to the daemon socket, sends a command, waits for the response,
 * and disconnects.
 *
 * @param message - The command message to send
 * @param options - Connection options including socket path and timeouts
 * @returns The daemon's response message
 * @throws {ClientConnectionError} If the connection fails or times out
 */
export async function sendAndReceive(
	message: CommandMessage,
	options: ClientSocketOptions,
): Promise<DaemonMessage> {
	const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await attemptSendAndReceive(message, options);
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));

			// Only retry on connection errors, not on response errors
			if (!isRetryableError(lastError)) {
				throw lastError;
			}

			if (attempt < maxRetries) {
				await delay(RETRY_DELAY);
			}
		}
	}

	throw new ClientConnectionError(
		`Failed to connect to daemon after ${maxRetries + 1} attempts: ${lastError?.message ?? 'unknown error'}. ` +
			'Is the daemon running? Start a session with `cypress-cli open <url>`.',
	);
}

/**
 * Single attempt to connect, send, and receive.
 */
async function attemptSendAndReceive(
	message: CommandMessage,
	options: ClientSocketOptions,
): Promise<DaemonMessage> {
	const connectTimeout = options.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT;
	const responseTimeout = options.responseTimeout ?? DEFAULT_RESPONSE_TIMEOUT;

	const socket = await connectSocket(options.socketPath, connectTimeout);

	try {
		return await exchangeMessage(socket, message, responseTimeout);
	} finally {
		socket.destroy();
	}
}

/**
 * Establishes a connection to a Unix domain socket.
 *
 * @param socketPath - Path to the socket file
 * @param timeout - Connection timeout in ms
 * @returns The connected socket
 * @throws {ClientConnectionError} If the connection fails or times out
 */
function connectSocket(socketPath: string, timeout: number): Promise<net.Socket> {
	return new Promise<net.Socket>((resolve, reject) => {
		const socket = net.createConnection(socketPath);
		let settled = false;

		const timer = setTimeout(() => {
			if (!settled) {
				settled = true;
				socket.destroy();
				reject(
					new ClientConnectionError(
						`Connection to daemon timed out after ${timeout}ms. Socket: ${socketPath}`,
					),
				);
			}
		}, timeout);

		socket.on('connect', () => {
			if (!settled) {
				settled = true;
				clearTimeout(timer);
				resolve(socket);
			}
		});

		socket.on('error', (err: Error) => {
			if (!settled) {
				settled = true;
				clearTimeout(timer);
				reject(
					new ClientConnectionError(
						`Cannot connect to daemon socket at ${socketPath}: ${err.message}. ` +
							'Is the daemon running? Start a session with `cypress-cli open <url>`.',
					),
				);
			}
		});
	});
}

/**
 * Sends a command and waits for the response over an established socket.
 */
function exchangeMessage(
	socket: net.Socket,
	message: CommandMessage,
	timeout: number,
): Promise<DaemonMessage> {
	return new Promise<DaemonMessage>((resolve, reject) => {
		let buffer = '';
		const decoder = new StringDecoder('utf-8');
		let settled = false;

		const timer = setTimeout(() => {
			if (!settled) {
				settled = true;
				reject(
					new ClientConnectionError(
						`Timed out waiting for daemon response after ${timeout}ms.`,
					),
				);
			}
		}, timeout);

		socket.on('data', (chunk: Buffer | string) => {
			if (settled) return;

			const decoded = typeof chunk === 'string' ? chunk : decoder.write(chunk);
			buffer += decoded;

			const newlineIndex = buffer.indexOf('\n');
			if (newlineIndex !== -1) {
				settled = true;
				clearTimeout(timer);
				const line = buffer.slice(0, newlineIndex);
				try {
					const parsed = deserializeMessage(line);
					resolve(parsed as DaemonMessage);
				} catch (err) {
					reject(
						err instanceof Error
							? err
							: new Error(String(err)),
					);
				}
			}
		});

		socket.on('error', (err: Error) => {
			if (!settled) {
				settled = true;
				clearTimeout(timer);
				reject(
					new ClientConnectionError(
						`Socket error while waiting for response: ${err.message}`,
					),
				);
			}
		});

		socket.on('close', () => {
			if (!settled) {
				settled = true;
				clearTimeout(timer);
				reject(
					new ClientConnectionError(
						'Daemon closed the connection before sending a response.',
					),
				);
			}
		});

		// Send the command
		const serialized = serializeMessage(message);
		socket.write(serialized);
	});
}

/**
 * Determines if an error is retryable (connection-level errors only).
 * Response-level errors (response timeout, protocol errors) are NOT retried
 * since the connection was established successfully.
 */
function isRetryableError(error: Error): boolean {
	if (error instanceof ClientConnectionError) {
		// Only retry connection-phase errors, not response-phase errors
		return error.message.includes('Cannot connect') ||
			error.message.includes('Connection to daemon timed out') ||
			error.message.includes('ECONNREFUSED') ||
			error.message.includes('ENOENT');
	}
	return false;
}

/**
 * Promise-based delay.
 */
function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Error thrown when a client connection operation fails.
 */
export class ClientConnectionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ClientConnectionError';
	}
}
