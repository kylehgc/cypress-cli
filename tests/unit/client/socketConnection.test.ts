import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import {
	sendAndReceive,
	ClientConnectionError,
	type ClientSocketOptions,
} from '../../../src/client/socketConnection.js';
import {
	serializeMessage,
	type CommandMessage,
	type ResponseMessage,
} from '../../../src/daemon/protocol.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a temporary directory for socket files. */
async function makeTempSocketDir(): Promise<string> {
	return await fs.mkdtemp(path.join(os.tmpdir(), 'cypress-cli-sock-test-'));
}

/** A sample command message for testing. */
function sampleCommand(id = 1): CommandMessage {
	return {
		id,
		method: 'run',
		params: { args: { _: ['snapshot'] } },
	};
}

/** A sample success response matching the command. */
function sampleResponse(id = 1): ResponseMessage {
	return {
		id,
		result: { success: true, snapshot: '- document' },
	};
}

// ---------------------------------------------------------------------------
// sendAndReceive
// ---------------------------------------------------------------------------

describe('sendAndReceive', () => {
	let socketDir: string;
	let socketPath: string;
	let server: net.Server;

	beforeEach(async () => {
		socketDir = await makeTempSocketDir();
		socketPath = path.join(socketDir, 'test.sock');
	});

	afterEach(async () => {
		if (server) {
			await new Promise<void>((resolve) => {
				server.close(() => resolve());
			});
		}
		await fs.rm(socketDir, { recursive: true, force: true }).catch(() => {});
	});

	/**
	 * Start a simple UDS server that echoes back a response for each
	 * newline-delimited command it receives.
	 */
	function startEchoServer(
		handler?: (data: string, socket: net.Socket) => void,
	): Promise<void> {
		return new Promise<void>((resolve) => {
			server = net.createServer((socket) => {
				let buffer = '';
				socket.on('data', (chunk) => {
					buffer += chunk.toString();
					const newlineIndex = buffer.indexOf('\n');
					if (newlineIndex !== -1) {
						const line = buffer.slice(0, newlineIndex);
						buffer = buffer.slice(newlineIndex + 1);
						if (handler) {
							handler(line, socket);
						} else {
							// Default: parse the command id and send a success response
							const parsed = JSON.parse(line) as CommandMessage;
							const response = sampleResponse(parsed.id);
							socket.write(serializeMessage(response));
						}
					}
				});
			});
			server.listen(socketPath, resolve);
		});
	}

	it('sends command and receives response through socket', async () => {
		await startEchoServer();

		const result = await sendAndReceive(sampleCommand(), {
			socketPath,
			maxRetries: 0,
		});

		expect(result).toEqual(sampleResponse());
	});

	it('handles error response from daemon', async () => {
		await startEchoServer((_line, socket) => {
			const errorMsg = { id: 1, error: 'No session running' };
			socket.write(JSON.stringify(errorMsg) + '\n');
		});

		const result = await sendAndReceive(sampleCommand(), {
			socketPath,
			maxRetries: 0,
		});

		expect(result).toEqual({ id: 1, error: 'No session running' });
	});

	it('throws ClientConnectionError when socket does not exist', async () => {
		const badPath = path.join(socketDir, 'nonexistent.sock');

		await expect(
			sendAndReceive(sampleCommand(), {
				socketPath: badPath,
				maxRetries: 0,
				connectTimeout: 500,
			}),
		).rejects.toThrow(ClientConnectionError);
	});

	it('throws ClientConnectionError when connection is refused', async () => {
		// Create a regular file where the socket should be — not a real socket
		await fs.writeFile(socketPath, '');

		await expect(
			sendAndReceive(sampleCommand(), {
				socketPath,
				maxRetries: 0,
				connectTimeout: 500,
			}),
		).rejects.toThrow(ClientConnectionError);
	});

	it('retries on connection failure (up to maxRetries)', async () => {
		// Start the server after a short delay so the first attempt fails
		const serverStartDelay = 600; // ms — longer than one RETRY_DELAY (500ms)

		setTimeout(async () => {
			await startEchoServer();
		}, serverStartDelay);

		const result = await sendAndReceive(sampleCommand(), {
			socketPath,
			maxRetries: 3,
			connectTimeout: 300,
		});

		expect(result).toEqual(sampleResponse());
	});

	it('throws after all retries exhausted', async () => {
		const badPath = path.join(socketDir, 'never.sock');

		await expect(
			sendAndReceive(sampleCommand(), {
				socketPath: badPath,
				maxRetries: 1,
				connectTimeout: 200,
			}),
		).rejects.toThrow(/Failed to connect to daemon after 2 attempts/);
	});

	it('throws on response timeout', async () => {
		// Server accepts connection but never sends a response
		await startEchoServer((_line, _socket) => {
			// intentionally do nothing
		});

		await expect(
			sendAndReceive(sampleCommand(), {
				socketPath,
				maxRetries: 0,
				responseTimeout: 200,
			}),
		).rejects.toThrow(/Timed out waiting for daemon response/);
	});

	it('does not retry on response timeout (only connection errors are retried)', async () => {
		// Server accepts connection but never responds — this is a response-level
		// error, not a connection error, so it should NOT be retried.
		await startEchoServer((_line, _socket) => {
			// intentionally do nothing
		});

		const start = Date.now();
		await expect(
			sendAndReceive(sampleCommand(), {
				socketPath,
				maxRetries: 3,
				responseTimeout: 200,
			}),
		).rejects.toThrow(/Timed out waiting for daemon response/);
		const elapsed = Date.now() - start;

		// If it retried 3 times at 200ms + 500ms delays, it would take >2s.
		// Without retries, it should finish in roughly 200ms + overhead.
		expect(elapsed).toBeLessThan(1000);
	});

	it('throws when daemon closes connection before responding', async () => {
		await startEchoServer((_line, socket) => {
			// Close immediately without sending a response
			socket.end();
		});

		await expect(
			sendAndReceive(sampleCommand(), {
				socketPath,
				maxRetries: 0,
			}),
		).rejects.toThrow(ClientConnectionError);
	});
});

// ---------------------------------------------------------------------------
// ClientConnectionError
// ---------------------------------------------------------------------------

describe('ClientConnectionError', () => {
	it('has correct name property', () => {
		const err = new ClientConnectionError('test message');
		expect(err.name).toBe('ClientConnectionError');
	});

	it('has correct message', () => {
		const err = new ClientConnectionError('could not connect');
		expect(err.message).toBe('could not connect');
		expect(err).toBeInstanceOf(Error);
	});
});
