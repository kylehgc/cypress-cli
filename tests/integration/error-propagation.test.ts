/**
 * Integration test: Error propagation.
 *
 * Verifies that when a command fails in Cypress (simulated), the error
 * propagates through the daemon back to the client as a structured error
 * message. Tests both the queue/task-handler path and the full socket path.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { Daemon } from '../../src/daemon/daemon.js';
import { SocketConnection } from '../../src/daemon/connection.js';
import {
	CommandQueue,
} from '../../src/daemon/commandQueue.js';
import { createTaskHandlers } from '../../src/daemon/taskHandler.js';
import {
	sendAndReceive,
	type ClientSocketOptions,
} from '../../src/client/socketConnection.js';
import type {
	CommandMessage,
	ProtocolMessage,
} from '../../src/daemon/protocol.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTempSocketDir(): Promise<string> {
	return await fs.mkdtemp(path.join(os.tmpdir(), 'cypress-cli-integ-'));
}

function connectClient(socketPath: string): Promise<SocketConnection> {
	return new Promise<SocketConnection>((resolve, reject) => {
		const socket = net.createConnection(socketPath);
		socket.on('connect', () => resolve(new SocketConnection(socket)));
		socket.on('error', reject);
	});
}

function waitForMessage(conn: SocketConnection): Promise<ProtocolMessage> {
	return new Promise<ProtocolMessage>((resolve) => {
		conn.onMessage((msg) => resolve(msg));
	});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Error propagation integration', () => {
	// -----------------------------------------------------------------------
	// Error via queue + task handlers (no socket)
	// -----------------------------------------------------------------------

	describe('error via queue and task handlers', () => {
		let queue: CommandQueue;

		beforeEach(() => {
			queue = new CommandQueue();
		});

		it('propagates command failure result to enqueue caller', async () => {
			const { getCommand, commandResult } = createTaskHandlers(queue, 5000);

			const enqueuePromise = queue.enqueue({
				id: 1,
				action: 'click',
				ref: 'e99',
			});

			await getCommand();

			// Simulate Cypress command failure
			commandResult({
				success: false,
				error: 'Element ref e99 not found in current snapshot',
			});

			const result = await enqueuePromise;
			expect(result.success).toBe(false);
			expect(result.error).toBe(
				'Element ref e99 not found in current snapshot',
			);
		});

		it('queue disposal rejects all pending enqueue promises', async () => {
			const p1 = queue.enqueue({ id: 1, action: 'click', ref: 'e1' });
			const p2 = queue.enqueue({ id: 2, action: 'type', ref: 'e2' });

			queue.dispose();

			await expect(p1).rejects.toThrow(/disposed/);
			await expect(p2).rejects.toThrow(/disposed/);
		});

		it('queue disposal rejects in-flight command', async () => {
			const enqueuePromise = queue.enqueue({
				id: 1,
				action: 'click',
				ref: 'e1',
			});

			// Dequeue to make it in-flight
			await queue.dequeue();

			// Dispose while in-flight
			queue.dispose();

			await expect(enqueuePromise).rejects.toThrow(/disposed/);
		});
	});

	// -----------------------------------------------------------------------
	// Error via daemon socket (full path)
	// -----------------------------------------------------------------------

	describe('error via daemon socket', () => {
		let socketDir: string;
		let daemon: Daemon;

		beforeEach(async () => {
			socketDir = await makeTempSocketDir();
		});

		afterEach(async () => {
			if (daemon) {
				await daemon.stop();
			}
			await fs.rm(socketDir, { recursive: true, force: true }).catch(() => {});
		});

		it('command failure propagates as failed response to client via raw socket', async () => {
			daemon = new Daemon({
				sessionId: 'error-raw',
				socketDir,
				idleTimeout: 0,
			});
			await daemon.start();

			const session = daemon.createSession({ id: 'err-sess' });
			session.transition('running');

			const client = await connectClient(daemon.socketPath);
			const responsePromise = waitForMessage(client);

			const cmd: CommandMessage = {
				id: 1,
				method: 'run',
				params: { args: { _: ['click', 'e99'] } },
			};
			client.send(cmd);

			// Simulate Cypress reporting an error
			const command = await session.queue.dequeue();
			expect(command.ref).toBe('e99');

			session.queue.reportResult({
				success: false,
				error: 'Element ref e99 not found in current snapshot',
			});

			// Client receives structured error
			const response = await responsePromise;
			expect(response).toHaveProperty('id', 1);
			expect(response).toHaveProperty('result.success', false);
			expect(response).toHaveProperty(
				'result.error',
				'Element ref e99 not found in current snapshot',
			);

			client.close();
		});

		it('command failure propagates as failed response to client via sendAndReceive', async () => {
			daemon = new Daemon({
				sessionId: 'error-sendrecv',
				socketDir,
				idleTimeout: 0,
			});
			await daemon.start();

			const session = daemon.createSession({ id: 'err-sess2' });
			session.transition('running');

			const opts: ClientSocketOptions = {
				socketPath: daemon.socketPath,
				connectTimeout: 2000,
				responseTimeout: 5000,
				maxRetries: 0,
			};

			const cmd: CommandMessage = {
				id: 5,
				method: 'run',
				params: { args: { _: ['type', 'e3', 'world'] } },
			};

			const responsePromise = sendAndReceive(cmd, opts);

			// Simulate Cypress processing and error
			const dequeued = await session.queue.dequeue();
			expect(dequeued.action).toBe('type');
			expect(dequeued.ref).toBe('e3');
			expect(dequeued.text).toBe('world');

			session.queue.reportResult({
				success: false,
				error: 'Element e3 is not an input field',
			});

			const response = await responsePromise;
			expect(response).toHaveProperty('id', 5);
			expect(response).toHaveProperty('result.success', false);
			expect(response).toHaveProperty(
				'result.error',
				'Element e3 is not an input field',
			);
		});

		it('no session running returns structured error to client', async () => {
			daemon = new Daemon({
				sessionId: 'error-nosess',
				socketDir,
				idleTimeout: 0,
			});
			await daemon.start();

			// No session created

			const opts: ClientSocketOptions = {
				socketPath: daemon.socketPath,
				connectTimeout: 2000,
				responseTimeout: 2000,
				maxRetries: 0,
			};

			const response = await sendAndReceive(
				{
					id: 1,
					method: 'run',
					params: { args: { _: ['click', 'e1'] } },
				},
				opts,
			);

			expect(response).toHaveProperty('error');
			const errorMsg = (response as { error: string }).error;
			expect(errorMsg).toContain('No session running');
			expect(errorMsg).toContain('cypress-cli open');
		});

		it('empty command args returns structured error to client', async () => {
			daemon = new Daemon({
				sessionId: 'error-noargs',
				socketDir,
				idleTimeout: 0,
			});
			await daemon.start();

			const opts: ClientSocketOptions = {
				socketPath: daemon.socketPath,
				connectTimeout: 2000,
				responseTimeout: 2000,
				maxRetries: 0,
			};

			const response = await sendAndReceive(
				{
					id: 1,
					method: 'run',
					params: { args: { _: [] } },
				},
				opts,
			);

			expect(response).toHaveProperty('error');
			const errorMsg = (response as { error: string }).error;
			expect(errorMsg).toContain('No command specified');
		});

		it('session stopped while command in-flight propagates error', async () => {
			daemon = new Daemon({
				sessionId: 'error-inflight-stop',
				socketDir,
				idleTimeout: 0,
			});
			await daemon.start();

			const session = daemon.createSession({ id: 'stop-mid' });
			session.transition('running');

			const client = await connectClient(daemon.socketPath);
			const responsePromise = waitForMessage(client);

			const cmd: CommandMessage = {
				id: 1,
				method: 'run',
				params: { args: { _: ['click', 'e1'] } },
			};
			client.send(cmd);

			// Wait for the command to be enqueued in the session queue
			while (session.queue.size === 0 && !session.queue.hasInflight) {
				await new Promise((r) => setTimeout(r, 5));
			}

			// Stop the session while the command is pending in the queue
			daemon.stopSession('stop-mid');

			// The client should receive an error due to queue disposal
			const response = await responsePromise;
			expect(response).toHaveProperty('id', 1);
			expect(response).toHaveProperty('error');
			expect((response as { error: string }).error).toContain('disposed');

			client.close();
		});
	});
});
