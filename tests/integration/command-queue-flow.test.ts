/**
 * Integration test: Command queue flow.
 *
 * Verifies that multiple commands are queued, processed in strict FIFO order,
 * and results are returned to the correct callers. Tests both the queue
 * directly and through the daemon's socket interface.
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
	type QueuedCommand,
	type CommandResult,
} from '../../src/daemon/commandQueue.js';
import { createTaskHandlers } from '../../src/daemon/taskHandler.js';
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

describe('Command queue flow integration', () => {
	// -----------------------------------------------------------------------
	// FIFO ordering with CommandQueue + TaskHandlers
	// -----------------------------------------------------------------------

	describe('FIFO ordering via queue and task handlers', () => {
		let queue: CommandQueue;

		beforeEach(() => {
			queue = new CommandQueue();
		});

		it('processes multiple commands in strict FIFO order', async () => {
			const { getCommand, commandResult } = createTaskHandlers(queue, 5000);

			// Enqueue 3 commands before any are dequeued
			const p1 = queue.enqueue({ id: 1, action: 'click', ref: 'e1' });
			const p2 = queue.enqueue({
				id: 2,
				action: 'type',
				ref: 'e2',
				text: 'hello',
			});
			const p3 = queue.enqueue({ id: 3, action: 'snapshot' });

			// Process them one at a time: getCommand → commandResult
			const cmd1 = (await getCommand()) as QueuedCommand;
			expect(cmd1.id).toBe(1);
			expect(cmd1.action).toBe('click');
			commandResult({ success: true, snapshot: 'snap-1' });
			const r1 = await p1;
			expect(r1.snapshot).toBe('snap-1');

			const cmd2 = (await getCommand()) as QueuedCommand;
			expect(cmd2.id).toBe(2);
			expect(cmd2.action).toBe('type');
			expect(cmd2.text).toBe('hello');
			commandResult({ success: true, snapshot: 'snap-2' });
			const r2 = await p2;
			expect(r2.snapshot).toBe('snap-2');

			const cmd3 = (await getCommand()) as QueuedCommand;
			expect(cmd3.id).toBe(3);
			expect(cmd3.action).toBe('snapshot');
			commandResult({ success: true, snapshot: 'snap-3' });
			const r3 = await p3;
			expect(r3.snapshot).toBe('snap-3');
		});

		it('returns results to correct callers when commands interleave', async () => {
			const { getCommand, commandResult } = createTaskHandlers(queue, 5000);

			// Enqueue commands with distinct payloads
			const results: CommandResult[] = [];

			const p1 = queue.enqueue({ id: 10, action: 'click', ref: 'btn-a' });
			p1.then((r) => results.push(r));

			const p2 = queue.enqueue({ id: 20, action: 'click', ref: 'btn-b' });
			p2.then((r) => results.push(r));

			// Process first
			const cmd1 = (await getCommand()) as QueuedCommand;
			expect(cmd1.ref).toBe('btn-a');
			commandResult({ success: true, snapshot: 'after-btn-a' });

			// Process second
			const cmd2 = (await getCommand()) as QueuedCommand;
			expect(cmd2.ref).toBe('btn-b');
			commandResult({ success: true, snapshot: 'after-btn-b' });

			const [r1, r2] = await Promise.all([p1, p2]);
			expect(r1.snapshot).toBe('after-btn-a');
			expect(r2.snapshot).toBe('after-btn-b');
		});

		it('queue reports correct size as commands are processed', async () => {
			const { getCommand, commandResult } = createTaskHandlers(queue, 5000);

			expect(queue.size).toBe(0);

			queue.enqueue({ id: 1, action: 'a' });
			queue.enqueue({ id: 2, action: 'b' });
			queue.enqueue({ id: 3, action: 'c' });

			// All 3 are pending since no one is dequeuing
			expect(queue.size).toBe(3);

			// Dequeue first
			await getCommand();
			expect(queue.size).toBe(2);
			expect(queue.hasInflight).toBe(true);

			// Complete first
			commandResult({ success: true });
			expect(queue.hasInflight).toBe(false);

			// Dequeue second
			await getCommand();
			expect(queue.size).toBe(1);

			// Complete second
			commandResult({ success: true });

			// Dequeue third
			await getCommand();
			expect(queue.size).toBe(0);

			// Complete third
			commandResult({ success: true });
		});
	});

	// -----------------------------------------------------------------------
	// FIFO ordering through the full daemon socket
	// -----------------------------------------------------------------------

	describe('FIFO ordering through daemon socket', () => {
		let socketDir: string;
		let snapshotDir: string;
		let daemon: Daemon;

		beforeEach(async () => {
			socketDir = await makeTempSocketDir();
			snapshotDir = await fs.mkdtemp(
				path.join(os.tmpdir(), 'cypress-cli-snap-'),
			);
		});

		afterEach(async () => {
			if (daemon) {
				await daemon.stop();
			}
			await fs.rm(socketDir, { recursive: true, force: true }).catch(() => {});
			await fs
				.rm(snapshotDir, { recursive: true, force: true })
				.catch(() => {});
		});

		it('commands from multiple clients are processed in arrival order', async () => {
			daemon = new Daemon({
				sessionId: 'fifo-socket',
				socketDir,
				snapshotDir,
				idleTimeout: 0,
			});
			await daemon.start();

			const session = daemon.createSession({ id: 'fifo-sess' });
			session.transition('running');

			// Connect two clients and send commands
			const client1 = await connectClient(daemon.socketPath);
			const client2 = await connectClient(daemon.socketPath);

			const r1Promise = waitForMessage(client1);
			const r2Promise = waitForMessage(client2);

			const cmd1: CommandMessage = {
				id: 1,
				method: 'run',
				params: { args: { _: ['click', 'e1'] } },
			};
			const cmd2: CommandMessage = {
				id: 2,
				method: 'run',
				params: { args: { _: ['click', 'e2'] } },
			};

			// Send first command and wait for it to be enqueued deterministically
			client1.send(cmd1);
			while (session.queue.size === 0 && !session.queue.hasInflight) {
				await new Promise((r) => setTimeout(r, 5));
			}
			client2.send(cmd2);

			// Process first command
			const dequeued1 = await session.queue.dequeue();
			expect(dequeued1.id).toBe(1);
			expect(dequeued1.ref).toBe('e1');
			session.queue.reportResult({
				success: true,
				snapshot: 'after-e1',
			});

			// Process second command
			const dequeued2 = await session.queue.dequeue();
			expect(dequeued2.id).toBe(2);
			expect(dequeued2.ref).toBe('e2');
			session.queue.reportResult({
				success: true,
				snapshot: 'after-e2',
			});

			// Verify responses go to correct clients
			const resp1 = await r1Promise;
			expect(resp1).toMatchObject({
				id: 1,
				result: { success: true, snapshot: 'after-e1' },
			});

			const resp2 = await r2Promise;
			expect(resp2).toMatchObject({
				id: 2,
				result: { success: true, snapshot: 'after-e2' },
			});

			client1.close();
			client2.close();
		});
	});
});
