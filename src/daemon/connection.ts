/**
 * Newline-delimited JSON framing over a stream (Socket or similar).
 *
 * Handles:
 * - Buffering partial messages split across multiple `data` events
 * - Extracting multiple messages from a single `data` event
 * - Emitting deserialized messages via a callback
 * - Safe UTF-8 decoding across chunk boundaries via StringDecoder
 * - Maximum buffer size enforcement to prevent unbounded memory growth
 *
 * Modeled after Playwright's SocketConnection in
 * packages/playwright-core/src/cli/client/socketConnection.ts
 */

import type { Duplex } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

import {
	deserializeMessage,
	serializeMessage,
	type ProtocolMessage,
} from './protocol.js';

/**
 * Maximum bytes buffered before a newline is received.
 * Protects against unbounded memory growth from a misbehaving peer.
 * 10 MB is generous — aria snapshots can be large but not unbounded.
 */
const MAX_BUFFER_SIZE = 10 * 1024 * 1024;

/**
 * Callback invoked when a complete protocol message has been received.
 */
export type MessageHandler = (message: ProtocolMessage) => void;

/**
 * Callback invoked when the underlying transport closes.
 */
export type CloseHandler = () => void;

/**
 * Callback invoked when the underlying transport or framing encounters an error.
 */
export type ErrorHandler = (error: Error) => void;

/**
 * Manages newline-delimited JSON framing over a duplex stream.
 *
 * Reassembles split buffers and handles multiple messages per buffer.
 * Uses StringDecoder to safely handle multi-byte UTF-8 characters
 * that may be split across chunk boundaries.
 * The stream is typically a `net.Socket` (Unix domain socket).
 */
export class SocketConnection {
	private _buffer = '';
	private _decoder = new StringDecoder('utf-8');
	private _stream: Duplex;
	private _onMessage: MessageHandler | null = null;
	private _onClose: CloseHandler | null = null;
	private _onError: ErrorHandler | null = null;
	private _isClosed = false;

	constructor(stream: Duplex) {
		this._stream = stream;

		this._stream.on('data', (chunk: Buffer | string) => {
			// Use StringDecoder to safely handle multi-byte UTF-8 characters
			// that may be split across data events
			const decoded =
				typeof chunk === 'string' ? chunk : this._decoder.write(chunk);
			this._onData(decoded);
		});

		this._stream.on('close', () => {
			this._isClosed = true;
			this._onClose?.();
		});

		this._stream.on('error', (err: Error) => {
			this._onError?.(err);
		});
	}

	/**
	 * Register a handler for incoming protocol messages.
	 */
	onMessage(handler: MessageHandler): void {
		this._onMessage = handler;
	}

	/**
	 * Register a handler for stream close events.
	 */
	onClose(handler: CloseHandler): void {
		this._onClose = handler;
	}

	/**
	 * Register a handler for stream errors.
	 */
	onError(handler: ErrorHandler): void {
		this._onError = handler;
	}

	/**
	 * Sends a protocol message over the stream.
	 *
	 * @param message - The message to serialize and send
	 * @throws {ConnectionError} If the connection is already closed
	 */
	send(message: ProtocolMessage): void {
		if (this._isClosed) {
			throw new ConnectionError('Cannot send message: connection is closed.');
		}
		const serialized = serializeMessage(message);
		this._stream.write(serialized);
	}

	/**
	 * Closes the underlying stream.
	 */
	close(): void {
		if (!this._isClosed) {
			this._isClosed = true;
			this._stream.end();
		}
	}

	/**
	 * Whether the connection has been closed.
	 */
	get isClosed(): boolean {
		return this._isClosed;
	}

	/**
	 * Handles raw data from the stream, buffering and extracting
	 * complete newline-delimited JSON messages.
	 * Enforces a maximum buffer size to prevent unbounded memory growth.
	 */
	private _onData(data: string): void {
		this._buffer += data;

		// Guard against unbounded memory growth from a peer that never sends newlines
		if (this._buffer.length > MAX_BUFFER_SIZE) {
			const err = new ConnectionError(
				`Buffer exceeded maximum size of ${MAX_BUFFER_SIZE} bytes. Closing connection.`,
			);
			this._onError?.(err);
			this.close();
			return;
		}

		let newlineIndex: number;
		while ((newlineIndex = this._buffer.indexOf('\n')) !== -1) {
			const line = this._buffer.slice(0, newlineIndex);
			this._buffer = this._buffer.slice(newlineIndex + 1);

			if (line.trim().length === 0) {
				continue;
			}

			try {
				const message = deserializeMessage(line);
				this._onMessage?.(message);
			} catch (err) {
				this._onError?.(err instanceof Error ? err : new Error(String(err)));
			}
		}
	}
}

/**
 * Error thrown when a connection-level operation fails.
 */
export class ConnectionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ConnectionError';
	}
}
