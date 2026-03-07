/**
 * Integration test: Client ↔ Daemon communication over real Unix domain sockets.
 *
 * Verifies that the client's sendAndReceive function can connect to a real
 * daemon server, send commands, and receive responses through the full
 * protocol stack (serialize → socket → deserialize → handle → serialize → socket → deserialize).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { Daemon } from '../../src/daemon/daemon.js';
import {
	sendAndReceive,
	type ClientSocketOptions,
} from '../../src/client/socketConnection.js';
import type { CommandMessage } from '../../src/daemon/protocol.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTempSocketDir(): Promise<string> {
	return await fs.mkdtemp(path.join(os.tmpdir(), 'cypress-cli-integ-'));
}

function makeRunCommand(id: number, args: string[]): CommandMessage {
	return {
		id,
		method: 'run',
		params: { args: { _: args } },
	};
}

function makeStopCommand(id: number): CommandMessage {
	return {
		id,
		method: 'stop',
		params: { args: { _: [] } },
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Client ↔ Daemon integration', () => {
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

	// -----------------------------------------------------------------------
	// Basic connectivity
	// -----------------------------------------------------------------------

	describe('basic connectivity', () => {
		it('connects and receives stop response', async () => {
			daemon = new Daemon({
				sessionId: 'client-stop',
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

			const response = await sendAndReceive(makeStopCommand(1), opts);
			expect(response).toEqual({ id: 1, result: { success: true } });
		});

		it('receives error when no session is running', async () => {
			daemon = new Daemon({
				sessionId: 'client-no-session',
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
				makeRunCommand(1, ['click', 'e5']),
				opts,
			);

			expect(response).toHaveProperty('error');
			expect((response as { error: string }).error).toContain(
				'No session running',
			);
		});

		it('receives error for empty command args', async () => {
			daemon = new Daemon({
				sessionId: 'client-empty-args',
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

			const response = await sendAndReceive(makeRunCommand(2, []), opts);

			expect(response).toHaveProperty('error');
			expect((response as { error: string }).error).toContain(
				'No command specified',
			);
		});
	});

	// -----------------------------------------------------------------------
	// Command round-trip with a running session
	// -----------------------------------------------------------------------

	describe('command round-trip with session', () => {
		it('sends command and receives result via queue', async () => {
			daemon = new Daemon({
				sessionId: 'client-roundtrip',
				socketDir,
				idleTimeout: 0,
			});
			await daemon.start();

			// Create a running session so the daemon accepts run commands
			const session = daemon.createSession({ id: 'sess-1' });
			session.transition('running');

			const opts: ClientSocketOptions = {
				socketPath: daemon.socketPath,
				connectTimeout: 2000,
				responseTimeout: 5000,
				maxRetries: 0,
			};

			// Send command from client — daemon enqueues it
			const responsePromise = sendAndReceive(
				makeRunCommand(1, ['click', 'e5']),
				opts,
			);

			// Simulate the Cypress plugin side: dequeue and report result
			const command = await session.queue.dequeue();
			expect(command.action).toBe('click');
			expect(command.ref).toBe('e5');

			session.queue.reportResult({
				success: true,
				snapshot: '- button "Login"',
			});

			const response = await responsePromise;
			expect(response).toEqual({
				id: 1,
				result: { success: true, snapshot: '- button "Login"' },
			});
		});

		it('handles multiple sequential commands from the same client', async () => {
			daemon = new Daemon({
				sessionId: 'client-multi',
				socketDir,
				idleTimeout: 0,
			});
			await daemon.start();

			const session = daemon.createSession({ id: 'sess-multi' });
			session.transition('running');

			const opts: ClientSocketOptions = {
				socketPath: daemon.socketPath,
				connectTimeout: 2000,
				responseTimeout: 5000,
				maxRetries: 0,
			};

			// First command
			const p1 = sendAndReceive(makeRunCommand(1, ['click', 'e1']), opts);
			const cmd1 = await session.queue.dequeue();
			expect(cmd1.action).toBe('click');
			session.queue.reportResult({ success: true, snapshot: 'snapshot-1' });
			const r1 = await p1;
			expect(r1).toEqual({
				id: 1,
				result: { success: true, snapshot: 'snapshot-1' },
			});

			// Second command (new client connection since sendAndReceive is one-shot)
			const p2 = sendAndReceive(
				makeRunCommand(2, ['type', 'e2', 'hello']),
				opts,
			);
			const cmd2 = await session.queue.dequeue();
			expect(cmd2.action).toBe('type');
			expect(cmd2.ref).toBe('e2');
			expect(cmd2.text).toBe('hello');
			session.queue.reportResult({ success: true, snapshot: 'snapshot-2' });
			const r2 = await p2;
			expect(r2).toEqual({
				id: 2,
				result: { success: true, snapshot: 'snapshot-2' },
			});
		});

		it('maps direct-style navigate arguments into the text field', async () => {
			daemon = new Daemon({
				sessionId: 'client-navigate',
				socketDir,
				idleTimeout: 0,
			});
			await daemon.start();

			const session = daemon.createSession({ id: 'sess-nav' });
			session.transition('running');

			const opts: ClientSocketOptions = {
				socketPath: daemon.socketPath,
				connectTimeout: 2000,
				responseTimeout: 5000,
				maxRetries: 0,
			};

			const responsePromise = sendAndReceive(
				makeRunCommand(3, ['navigate', 'https://example.com/dashboard']),
				opts,
			);

			const command = await session.queue.dequeue();
			expect(command.action).toBe('navigate');
			expect(command.ref).toBeUndefined();
			expect(command.text).toBe('https://example.com/dashboard');

			session.queue.reportResult({ success: true, snapshot: 'snapshot-nav' });
			const response = await responsePromise;
			expect(response).toEqual({
				id: 3,
				result: { success: true, snapshot: 'snapshot-nav' },
			});
		});

		it('maps direct-style assert arguments into chainer + value fields', async () => {
			daemon = new Daemon({
				sessionId: 'client-assert',
				socketDir,
				idleTimeout: 0,
			});
			await daemon.start();

			const session = daemon.createSession({ id: 'sess-assert' });
			session.transition('running');

			const opts: ClientSocketOptions = {
				socketPath: daemon.socketPath,
				connectTimeout: 2000,
				responseTimeout: 5000,
				maxRetries: 0,
			};

			const responsePromise = sendAndReceive(
				makeRunCommand(4, ['assert', 'e353', 'contain', 'submitted']),
				opts,
			);

			const command = await session.queue.dequeue();
			expect(command.action).toBe('assert');
			expect(command.ref).toBe('e353');
			expect(command.text).toBe('submitted');
			expect(command.options).toEqual({ chainer: 'contain' });

			session.queue.reportResult({ success: true, snapshot: 'snapshot-assert' });
			const response = await responsePromise;
			expect(response).toEqual({
				id: 4,
				result: { success: true, snapshot: 'snapshot-assert' },
			});
		});

		it('reports status without sending a command through Cypress', async () => {
			daemon = new Daemon({
				sessionId: 'client-status',
				socketDir,
				idleTimeout: 0,
			});
			await daemon.start();

			const session = daemon.createSession({
				id: 'sess-status',
				url: 'https://example.com',
				browser: 'electron',
				headed: false,
			});
			session.transition('running');

			const opts: ClientSocketOptions = {
				socketPath: daemon.socketPath,
				connectTimeout: 2000,
				responseTimeout: 5000,
				maxRetries: 0,
			};

			const response = await sendAndReceive(makeRunCommand(5, ['status']), opts);
			expect(response).toEqual({
				id: 5,
				result: {
					success: true,
					status: 'running',
					sessionId: 'sess-status',
					url: 'https://example.com',
					browser: 'electron',
					headed: false,
				},
			});
			expect(session.queue.size).toBe(0);
			expect(session.queue.hasInflight).toBe(false);
		});
	});
});
