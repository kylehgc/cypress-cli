/**
 * Integration test: Session lifecycle.
 *
 * Verifies the full lifecycle: open session → send commands → stop session → daemon cleans up.
 * Uses real UDS connections with temp socket paths but mocks the Cypress process.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { Daemon } from '../../src/daemon/daemon.js';
import { SocketConnection } from '../../src/daemon/connection.js';
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

describe('Session lifecycle integration', () => {
	let socketDir: string;
	let snapshotDir: string;
	let daemon: Daemon;

	beforeEach(async () => {
		socketDir = await makeTempSocketDir();
		snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cypress-cli-snap-'));
	});

	afterEach(async () => {
		if (daemon) {
			await daemon.stop();
		}
		await fs.rm(socketDir, { recursive: true, force: true }).catch(() => {});
		await fs.rm(snapshotDir, { recursive: true, force: true }).catch(() => {});
	});

	// -----------------------------------------------------------------------
	// Full lifecycle
	// -----------------------------------------------------------------------

	it('open session → send command → receive result → stop session', async () => {
		daemon = new Daemon({
			sessionId: 'lifecycle-full',
			socketDir,
			snapshotDir,
			idleTimeout: 0,
		});
		await daemon.start();

		// Step 1: Create session and transition to running
		const session = daemon.createSession({
			id: 'test-session',
			url: 'http://localhost:3000',
		});
		expect(session.state).toBe('waiting');
		session.transition('running');
		expect(session.state).toBe('running');

		// Step 2: Client connects and sends a command
		const client = await connectClient(daemon.socketPath);
		const responsePromise = waitForMessage(client);

		const runCmd: CommandMessage = {
			id: 1,
			method: 'run',
			params: { args: { _: ['click', 'e5'] } },
		};
		client.send(runCmd);

		// Step 3: Simulate Cypress plugin dequeuing and reporting result
		const command = await session.queue.dequeue();
		expect(command.action).toBe('click');
		expect(command.ref).toBe('e5');

		session.queue.reportResult({
			success: true,
			snapshot: '- button "Clicked"',
		});

		// Step 4: Client receives the response
		const response = await responsePromise;
		expect(response).toMatchObject({
			id: 1,
			result: { success: true, snapshot: '- button "Clicked"' },
		});

		client.close();

		// Step 5: Stop the session
		daemon.stopSession('test-session');
		expect(session.state).toBe('stopped');
		expect(daemon.getSession('test-session')).toBeUndefined();
		expect(session.queue.isDisposed).toBe(true);
	});

	it('disposes the queue and rejects pending commands on session cleanup', async () => {
		daemon = new Daemon({
			sessionId: 'lifecycle-cleanup',
			socketDir,
			snapshotDir,
			idleTimeout: 0,
		});
		await daemon.start();

		const session = daemon.createSession({ id: 'cleanup-session' });
		session.transition('running');

		// Enqueue a command that won't be resolved
		const enqueuePromise = session.enqueueCommand({
			id: 1,
			action: 'click',
			ref: 'e1',
		});

		// Stop the session — should dispose the queue
		daemon.stopSession('cleanup-session');
		expect(session.queue.isDisposed).toBe(true);

		// The pending enqueue should be rejected
		await expect(enqueuePromise).rejects.toThrow(/disposed/);
	});

	it('daemon stop cleans up all sessions', async () => {
		daemon = new Daemon({
			sessionId: 'lifecycle-stopall',
			socketDir,
			snapshotDir,
			idleTimeout: 0,
		});
		await daemon.start();

		const s1 = daemon.createSession({ id: 'sess-a' });
		s1.transition('running');
		const s2 = daemon.createSession({ id: 'sess-b' });
		s2.transition('running');

		await daemon.stop();

		expect(s1.state).toBe('stopped');
		expect(s2.state).toBe('stopped');
		expect(s1.queue.isDisposed).toBe(true);
		expect(s2.queue.isDisposed).toBe(true);
	});

	// -----------------------------------------------------------------------
	// Multiple sessions lifecycle
	// -----------------------------------------------------------------------

	it('can create, use, and stop multiple sessions sequentially', async () => {
		daemon = new Daemon({
			sessionId: 'lifecycle-sequential',
			socketDir,
			snapshotDir,
			idleTimeout: 0,
		});
		await daemon.start();

		// Session 1
		const s1 = daemon.createSession({ id: 'first' });
		s1.transition('running');

		const p1 = s1.enqueueCommand({ id: 1, action: 'snapshot' });
		const cmd1 = await s1.queue.dequeue();
		expect(cmd1.action).toBe('snapshot');
		s1.queue.reportResult({ success: true, snapshot: 'page-1' });
		const r1 = await p1;
		expect(r1.snapshot).toBe('page-1');

		daemon.stopSession('first');
		expect(s1.state).toBe('stopped');

		// Session 2 (after first is cleaned up)
		const s2 = daemon.createSession({ id: 'second' });
		s2.transition('running');

		const p2 = s2.enqueueCommand({ id: 2, action: 'click', ref: 'e1' });
		const cmd2 = await s2.queue.dequeue();
		expect(cmd2.action).toBe('click');
		s2.queue.reportResult({ success: true, snapshot: 'page-2' });
		const r2 = await p2;
		expect(r2.snapshot).toBe('page-2');

		daemon.stopSession('second');
		expect(s2.state).toBe('stopped');
	});

	// -----------------------------------------------------------------------
	// State transitions
	// -----------------------------------------------------------------------

	it('session state transitions are enforced', async () => {
		daemon = new Daemon({
			sessionId: 'lifecycle-states',
			socketDir,
			snapshotDir,
			idleTimeout: 0,
		});
		await daemon.start();

		const session = daemon.createSession({ id: 'state-test' });

		// Cannot go from waiting to paused
		expect(() => session.transition('paused')).toThrow(/Invalid state/);

		// Valid: waiting → running
		session.transition('running');
		expect(session.state).toBe('running');

		// Valid: running → paused
		session.transition('paused');
		expect(session.state).toBe('paused');

		// Cannot enqueue when paused
		expect(() => session.enqueueCommand({ id: 1, action: 'click' })).toThrow(
			/paused/,
		);

		// Valid: paused → running
		session.transition('running');
		expect(session.state).toBe('running');

		// Valid: running → stopped
		session.transition('stopped');
		expect(session.state).toBe('stopped');

		// Cannot transition from stopped
		expect(() => session.transition('running')).toThrow(/Invalid state/);
	});

	// -----------------------------------------------------------------------
	// Socket file cleanup
	// -----------------------------------------------------------------------

	it('socket file is removed after daemon stop', async () => {
		daemon = new Daemon({
			sessionId: 'lifecycle-socket',
			socketDir,
			snapshotDir,
			idleTimeout: 0,
		});
		await daemon.start();

		const socketPath = daemon.socketPath;
		await expect(fs.access(socketPath)).resolves.toBeUndefined();

		await daemon.stop();

		await expect(fs.access(socketPath)).rejects.toThrow();
	});
});
