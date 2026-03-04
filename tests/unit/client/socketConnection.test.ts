import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import {
	ClientSocketConnection,
	ClientConnectionError,
	ClientTimeoutError,
} from '../../../src/client/socketConnection.js';
import {
	serializeMessage,
	type ResponseMessage,
	type ErrorMessage,
} from '../../../src/daemon/protocol.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;
let socketPath: string;
let servers: net.Server[] = [];

beforeEach(async () => {
	tmpDir = path.join(os.tmpdir(), `cypress-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await fs.mkdir(tmpDir, { recursive: true });
	socketPath = path.join(tmpDir, 'test.sock');
	servers = [];
});

afterEach(async () => {
	for (const server of servers) {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
	servers = [];
	try {
		await fs.rm(tmpDir, { recursive: true, force: true });
	} catch {
		// Best effort cleanup
	}
});

function createMockServer(
	handler: (socket: net.Socket, data: string) => void,
): Promise<net.Server> {
	return new Promise<net.Server>((resolve) => {
		const server = net.createServer((socket) => {
			let buffer = '';
			socket.on('data', (chunk) => {
				buffer += chunk.toString();
				const idx = buffer.indexOf('\n');
				if (idx !== -1) {
					const line = buffer.slice(0, idx);
					buffer = buffer.slice(idx + 1);
					handler(socket, line);
				}
			});
		});
		servers.push(server);
		server.listen(socketPath, () => resolve(server));
	});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClientSocketConnection', () => {
	describe('sendAndReceive', () => {
		it('sends a message and receives a response', async () => {
			await createMockServer((socket, data) => {
				const msg = JSON.parse(data);
				const response: ResponseMessage = {
					id: msg.id,
					result: { success: true, snapshot: '- main' },
				};
				socket.write(serializeMessage(response));
			});

			const conn = new ClientSocketConnection({
				socketPath,
				connectTimeout: 2000,
				responseTimeout: 2000,
				maxRetries: 0,
			});

			const response = await conn.sendAndReceive({
				id: 1,
				method: 'run',
				params: { args: { _: ['status'] } },
			});

			expect('result' in response).toBe(true);
			if ('result' in response) {
				expect(response.result.success).toBe(true);
				expect(response.result.snapshot).toBe('- main');
			}
		});

		it('receives error responses', async () => {
			await createMockServer((socket, data) => {
				const msg = JSON.parse(data);
				const response: ErrorMessage = {
					id: msg.id,
					error: 'No session running.',
				};
				socket.write(serializeMessage(response));
			});

			const conn = new ClientSocketConnection({
				socketPath,
				connectTimeout: 2000,
				responseTimeout: 2000,
				maxRetries: 0,
			});

			const response = await conn.sendAndReceive({
				id: 1,
				method: 'run',
				params: { args: { _: ['click', 'e5'] } },
			});

			expect('error' in response).toBe(true);
			if ('error' in response) {
				expect(response.error).toBe('No session running.');
			}
		});

		it('handles split buffers (response split across data events)', async () => {
			await createMockServer((socket, _data) => {
				const response: ResponseMessage = {
					id: 1,
					result: { success: true, snapshot: '- heading "Test"' },
				};
				const serialized = serializeMessage(response);
				// Split the response across two writes
				const mid = Math.floor(serialized.length / 2);
				socket.write(serialized.slice(0, mid));
				setTimeout(() => {
					socket.write(serialized.slice(mid));
				}, 20);
			});

			const conn = new ClientSocketConnection({
				socketPath,
				connectTimeout: 2000,
				responseTimeout: 2000,
				maxRetries: 0,
			});

			const response = await conn.sendAndReceive({
				id: 1,
				method: 'run',
				params: { args: { _: ['snapshot'] } },
			});

			expect('result' in response).toBe(true);
			if ('result' in response) {
				expect(response.result.snapshot).toBe('- heading "Test"');
			}
		});

		it('throws ClientConnectionError when socket does not exist', async () => {
			const conn = new ClientSocketConnection({
				socketPath: '/tmp/nonexistent-cypress-cli-test.sock',
				connectTimeout: 500,
				responseTimeout: 1000,
				maxRetries: 0,
			});

			await expect(
				conn.sendAndReceive({
					id: 1,
					method: 'run',
					params: { args: { _: ['status'] } },
				}),
			).rejects.toThrow(ClientConnectionError);
		});

		it('throws ClientTimeoutError when daemon does not respond', async () => {
			// Server accepts connection but never responds
			await createMockServer(() => {
				// Intentionally empty — no response
			});

			const conn = new ClientSocketConnection({
				socketPath,
				connectTimeout: 2000,
				responseTimeout: 200,
				maxRetries: 0,
			});

			await expect(
				conn.sendAndReceive({
					id: 1,
					method: 'run',
					params: { args: { _: ['status'] } },
				}),
			).rejects.toThrow(ClientTimeoutError);
		});

		it('retries on connection failure', async () => {
			let attempts = 0;

			// Create server after a short delay to simulate daemon starting
			setTimeout(async () => {
				await createMockServer((socket, data) => {
					attempts++;
					const msg = JSON.parse(data);
					const response: ResponseMessage = {
						id: msg.id,
						result: { success: true },
					};
					socket.write(serializeMessage(response));
				});
			}, 300);

			const conn = new ClientSocketConnection({
				socketPath,
				connectTimeout: 1000,
				responseTimeout: 2000,
				maxRetries: 3,
				retryDelay: 200,
			});

			const response = await conn.sendAndReceive({
				id: 1,
				method: 'run',
				params: { args: { _: ['status'] } },
			});

			expect('result' in response).toBe(true);
			expect(attempts).toBe(1);
		});

		it('reports all attempts in error after max retries', async () => {
			const conn = new ClientSocketConnection({
				socketPath: '/tmp/nonexistent-cypress-cli-retry-test.sock',
				connectTimeout: 100,
				responseTimeout: 100,
				maxRetries: 1,
				retryDelay: 50,
			});

			try {
				await conn.sendAndReceive({
					id: 1,
					method: 'run',
					params: { args: { _: ['status'] } },
				});
				expect.fail('Should have thrown');
			} catch (err) {
				expect(err).toBeInstanceOf(ClientConnectionError);
				expect((err as Error).message).toContain('2 attempts');
			}
		});
	});

	describe('connection handling', () => {
		it('closes socket after receiving response (connection per command)', async () => {
			let connectionCount = 0;

			await createMockServer((socket, data) => {
				connectionCount++;
				const msg = JSON.parse(data);
				const response: ResponseMessage = {
					id: msg.id,
					result: { success: true },
				};
				socket.write(serializeMessage(response));
			});

			const conn = new ClientSocketConnection({
				socketPath,
				connectTimeout: 2000,
				responseTimeout: 2000,
				maxRetries: 0,
			});

			// Send two commands sequentially — each should create a new connection
			await conn.sendAndReceive({
				id: 1,
				method: 'run',
				params: { args: { _: ['status'] } },
			});

			await conn.sendAndReceive({
				id: 2,
				method: 'run',
				params: { args: { _: ['status'] } },
			});

			expect(connectionCount).toBe(2);
		});

		it('throws when daemon closes connection without responding', async () => {
			await createMockServer((socket) => {
				// Close immediately without responding
				socket.end();
			});

			const conn = new ClientSocketConnection({
				socketPath,
				connectTimeout: 2000,
				responseTimeout: 2000,
				maxRetries: 0,
			});

			await expect(
				conn.sendAndReceive({
					id: 1,
					method: 'run',
					params: { args: { _: ['status'] } },
				}),
			).rejects.toThrow(ClientConnectionError);
		});
	});
});
