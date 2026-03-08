import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import {
	Daemon,
	DaemonError,
	resolveSocketDir,
	isSocketAlive,
	cleanStaleSockets,
} from '../../../src/daemon/daemon.js';
import { SocketConnection } from '../../../src/daemon/connection.js';
import {
	type CommandMessage,
	type ResponseMessage,
} from '../../../src/daemon/protocol.js';

/**
 * Helper: create a temp dir for socket files.
 */
async function makeTempSocketDir(): Promise<string> {
	return await fs.mkdtemp(path.join(os.tmpdir(), 'cypress-cli-test-'));
}

/**
 * Helper: connect a client to the daemon's socket.
 */
function connectClient(socketPath: string): Promise<SocketConnection> {
	return new Promise<SocketConnection>((resolve, reject) => {
		const socket = net.createConnection(socketPath);
		socket.on('connect', () => {
			resolve(new SocketConnection(socket));
		});
		socket.on('error', reject);
	});
}

describe('Daemon', () => {
	let socketDir: string;
	let daemon: Daemon;

	beforeEach(async () => {
		socketDir = await makeTempSocketDir();
	});

	afterEach(async () => {
		// Always await stop() — it's safe to call even when already shutting down
		// because stop() returns the same promise for concurrent callers.
		if (daemon) {
			await daemon.stop();
		}
		// Clean up temp dir
		await fs.rm(socketDir, { recursive: true, force: true }).catch(() => {});
	});

	// -----------------------------------------------------------------------
	// start / stop lifecycle
	// -----------------------------------------------------------------------

	describe('start and stop', () => {
		it('creates socket file on start and removes it on stop', async () => {
			daemon = new Daemon({
				sessionId: 'test-lifecycle',
				socketDir,
				idleTimeout: 0,
			});

			await daemon.start();
			const socketPath = daemon.socketPath;

			// Socket file should exist
			await expect(fs.access(socketPath)).resolves.toBeUndefined();

			await daemon.stop();

			// Socket file should be removed
			await expect(fs.access(socketPath)).rejects.toThrow();
		});

		it('accepts client connections', async () => {
			daemon = new Daemon({
				sessionId: 'test-conn',
				socketDir,
				idleTimeout: 0,
			});

			await daemon.start();
			expect(daemon.connectionCount).toBe(0);

			const client = await connectClient(daemon.socketPath);
			// Give event loop a tick for the connection to be registered
			await new Promise((r) => setTimeout(r, 50));
			expect(daemon.connectionCount).toBe(1);

			client.close();
			await new Promise((r) => setTimeout(r, 50));
			expect(daemon.connectionCount).toBe(0);

			await daemon.stop();
		});

		it('stop is idempotent', async () => {
			daemon = new Daemon({
				sessionId: 'test-idempotent',
				socketDir,
				idleTimeout: 0,
			});

			await daemon.start();
			await daemon.stop();
			// Second stop should not throw
			await daemon.stop();
		});
	});

	// -----------------------------------------------------------------------
	// stale socket cleanup
	// -----------------------------------------------------------------------

	describe('stale socket cleanup', () => {
		it('removes stale socket file from previous instance', async () => {
			const sessionId = 'test-stale';
			const socketPath = path.join(socketDir, `${sessionId}.sock`);

			// Create a stale socket file (just a regular file, no listener)
			await fs.writeFile(socketPath, '');

			daemon = new Daemon({ sessionId, socketDir, idleTimeout: 0 });
			await daemon.start();

			// Should have started successfully despite the stale file
			const client = await connectClient(daemon.socketPath);
			client.close();

			await daemon.stop();
		});

		it('throws when another daemon is already listening', async () => {
			const sessionId = 'test-conflict';

			// Start a real daemon first
			daemon = new Daemon({ sessionId, socketDir, idleTimeout: 0 });
			await daemon.start();

			// Try to start a second daemon on the same socket
			const daemon2 = new Daemon({ sessionId, socketDir, idleTimeout: 0 });
			await expect(daemon2.start()).rejects.toThrow(DaemonError);
			await expect(daemon2.start()).rejects.toThrow('Another daemon');

			await daemon.stop();
		});
	});

	// -----------------------------------------------------------------------
	// idle timeout
	// -----------------------------------------------------------------------

	describe('idle timeout', () => {
		it('shuts down after idle timeout with no sessions', async () => {
			daemon = new Daemon({
				sessionId: 'test-idle',
				socketDir,
				idleTimeout: 100, // 100ms idle timeout for testing
			});

			await daemon.start();

			// Create and immediately stop a session to trigger idle timer
			const session = daemon.createSession({ id: 'temp-session' });
			session.transition('running');
			daemon.stopSession('temp-session');

			// Wait for idle timeout to fire
			await new Promise((r) => setTimeout(r, 200));
			expect(daemon.isShuttingDown).toBe(true);
		});

		it('cancels idle timer when a new session is created', async () => {
			daemon = new Daemon({
				sessionId: 'test-idle-cancel',
				socketDir,
				idleTimeout: 100,
			});

			await daemon.start();

			// Create and stop a session to start idle timer
			const s1 = daemon.createSession({ id: 'session-1' });
			s1.transition('running');
			daemon.stopSession('session-1');

			// Create a new session before idle fires
			await new Promise((r) => setTimeout(r, 50));
			daemon.createSession({ id: 'session-2' });

			// Wait past the original idle timeout
			await new Promise((r) => setTimeout(r, 100));

			// Should NOT have shut down
			expect(daemon.isShuttingDown).toBe(false);

			await daemon.stop();
		});

		it('does not set idle timer when idleTimeout is 0', async () => {
			daemon = new Daemon({
				sessionId: 'test-no-idle',
				socketDir,
				idleTimeout: 0,
			});

			await daemon.start();

			const session = daemon.createSession({ id: 'temp' });
			session.transition('running');
			daemon.stopSession('temp');

			await new Promise((r) => setTimeout(r, 100));
			expect(daemon.isShuttingDown).toBe(false);

			await daemon.stop();
		});
	});

	// -----------------------------------------------------------------------
	// session inactivity timeout
	// -----------------------------------------------------------------------

	describe('session inactivity timeout', () => {
		it('shuts down after inactivity timeout with no client activity', async () => {
			daemon = new Daemon({
				sessionId: 'test-inactivity',
				socketDir,
				idleTimeout: 0,
				sessionInactivityTimeout: 100, // 100ms for testing
			});

			await daemon.start();
			daemon.createSession({ id: 'active-session' });

			// Wait for inactivity timeout to fire
			await new Promise((r) => setTimeout(r, 200));
			expect(daemon.isShuttingDown).toBe(true);
		});

		it('resets inactivity timer on client connection', async () => {
			daemon = new Daemon({
				sessionId: 'test-inactivity-reset',
				socketDir,
				idleTimeout: 0,
				sessionInactivityTimeout: 200,
			});

			await daemon.start();
			daemon.createSession({ id: 'my-session' });

			// Connect a client before timeout fires (resets timer)
			await new Promise((r) => setTimeout(r, 100));
			const client = await connectClient(daemon.socketPath);
			await new Promise((r) => setTimeout(r, 50));
			client.close();

			// Shortly after connection, daemon should still be alive
			await new Promise((r) => setTimeout(r, 50));
			expect(daemon.isShuttingDown).toBe(false);

			// Wait for the reset inactivity timer to fire
			await new Promise((r) => setTimeout(r, 250));
			expect(daemon.isShuttingDown).toBe(true);
		});

		it('resets inactivity timer on incoming message', async () => {
			daemon = new Daemon({
				sessionId: 'test-inactivity-msg',
				socketDir,
				idleTimeout: 0,
				sessionInactivityTimeout: 150,
			});

			await daemon.start();
			const session = daemon.createSession({ id: 'msg-session' });
			session.transition('running');

			// Connect and send a message before timeout fires
			await new Promise((r) => setTimeout(r, 100));
			const client = await connectClient(daemon.socketPath);
			await new Promise((r) => setTimeout(r, 10));

			const statusCmd: CommandMessage = {
				id: 1,
				method: 'run',
				params: { args: { _: ['status'] } },
			};
			client.send(statusCmd);
			await new Promise((r) => setTimeout(r, 50));
			client.close();

			// Wait past original timeout, but not past reset
			await new Promise((r) => setTimeout(r, 50));
			expect(daemon.isShuttingDown).toBe(false);

			await daemon.stop();
		});

		it('does not set inactivity timer when sessionInactivityTimeout is 0', async () => {
			daemon = new Daemon({
				sessionId: 'test-no-inactivity',
				socketDir,
				idleTimeout: 0,
				sessionInactivityTimeout: 0,
			});

			await daemon.start();
			daemon.createSession({ id: 'persistent-session' });

			await new Promise((r) => setTimeout(r, 100));
			expect(daemon.isShuttingDown).toBe(false);

			await daemon.stop();
		});
	});

	// -----------------------------------------------------------------------
	// session management
	// -----------------------------------------------------------------------

	describe('session management', () => {
		it('creates and retrieves sessions', async () => {
			daemon = new Daemon({
				sessionId: 'test-sessions',
				socketDir,
				idleTimeout: 0,
			});

			await daemon.start();

			const session = daemon.createSession({
				id: 'my-session',
				url: 'http://localhost:3000',
			});
			expect(session.id).toBe('my-session');
			expect(daemon.getSession('my-session')).toBe(session);

			await daemon.stop();
		});

		it('stops and removes sessions', async () => {
			daemon = new Daemon({
				sessionId: 'test-stop-session',
				socketDir,
				idleTimeout: 0,
			});

			await daemon.start();

			const session = daemon.createSession({ id: 's1' });
			session.transition('running');

			daemon.stopSession('s1');
			expect(session.state).toBe('stopped');
			expect(daemon.getSession('s1')).toBeUndefined();

			await daemon.stop();
		});
	});

	// -----------------------------------------------------------------------
	// message handling
	// -----------------------------------------------------------------------

	describe('message handling', () => {
		it('responds to stop command', async () => {
			daemon = new Daemon({
				sessionId: 'test-stop-cmd',
				socketDir,
				idleTimeout: 0,
			});

			await daemon.start();

			const client = await connectClient(daemon.socketPath);

			const responsePromise = new Promise<ResponseMessage>((resolve) => {
				client.onMessage((msg) => {
					resolve(msg as ResponseMessage);
				});
			});

			const stopCmd: CommandMessage = {
				id: 1,
				method: 'stop',
				params: { args: { _: [] } },
			};
			client.send(stopCmd);

			const response = await responsePromise;
			expect(response.id).toBe(1);
			expect(response.result).toEqual({ success: true });

			// Wait for daemon to shut down
			await new Promise((r) => setTimeout(r, 100));
			expect(daemon.isShuttingDown).toBe(true);
		});

		it('responds with error when no session is running for run command', async () => {
			daemon = new Daemon({
				sessionId: 'test-no-session',
				socketDir,
				idleTimeout: 0,
			});

			await daemon.start();

			const client = await connectClient(daemon.socketPath);

			const responsePromise = new Promise<Record<string, unknown>>(
				(resolve) => {
					client.onMessage((msg) => {
						resolve(msg as Record<string, unknown>);
					});
				},
			);

			const runCmd: CommandMessage = {
				id: 2,
				method: 'run',
				params: { args: { _: ['click', 'e5'] } },
			};
			client.send(runCmd);

			const response = await responsePromise;
			expect(response.id).toBe(2);
			expect(response.error).toContain('No session running');

			await daemon.stop();
		});

		it('responds with error when run command has no args', async () => {
			daemon = new Daemon({
				sessionId: 'test-no-args',
				socketDir,
				idleTimeout: 0,
			});

			await daemon.start();

			const client = await connectClient(daemon.socketPath);

			const responsePromise = new Promise<Record<string, unknown>>(
				(resolve) => {
					client.onMessage((msg) => {
						resolve(msg as Record<string, unknown>);
					});
				},
			);

			const runCmd: CommandMessage = {
				id: 3,
				method: 'run',
				params: { args: { _: [] } },
			};
			client.send(runCmd);

			const response = await responsePromise;
			expect(response.id).toBe(3);
			expect(response.error).toContain('No command specified');

			await daemon.stop();
		});

		it('export command returns testFile when session is running', async () => {
			daemon = new Daemon({
				sessionId: 'test-export',
				socketDir,
				idleTimeout: 0,
			});

			await daemon.start();

			// Create a running session and record some history
			const session = daemon.createSession({ id: 'export-session' });
			session.transition('running');
			session.recordHistory(
				{ id: 1, action: 'navigate', text: '/login' },
				{ success: true, cypressCommand: "cy.visit('/login')" },
			);
			session.recordHistory(
				{ id: 2, action: 'click', ref: 'e5' },
				{
					success: true,
					selector: '#btn',
					cypressCommand: "cy.get('#btn').click()",
				},
			);

			const client = await connectClient(daemon.socketPath);

			const responsePromise = new Promise<Record<string, unknown>>(
				(resolve) => {
					client.onMessage((msg) => {
						resolve(msg as Record<string, unknown>);
					});
				},
			);

			const exportCmd: CommandMessage = {
				id: 10,
				method: 'run',
				params: { args: { _: ['export'] } },
			};
			client.send(exportCmd);

			const response = await responsePromise;
			expect(response.id).toBe(10);
			const result = response.result as Record<string, unknown>;
			expect(result.success).toBe(true);
			expect(typeof result.testFile).toBe('string');
			const testFile = result.testFile as string;
			expect(testFile).toContain('/// <reference types="cypress" />');
			expect(testFile).toContain("cy.visit('/login');");
			expect(testFile).toContain("cy.get('#btn').click();");
			expect(testFile).toContain("describe('cypress-cli generated test'");

			client.close();
			await daemon.stop();
		});

		it('export command writes the generated test file when --file is provided', async () => {
			daemon = new Daemon({
				sessionId: 'test-export-file',
				socketDir,
				idleTimeout: 0,
			});

			await daemon.start();

			const session = daemon.createSession({ id: 'export-file-session' });
			session.transition('running');
			session.recordHistory(
				{ id: 1, action: 'navigate', text: '/dashboard' },
				{ success: true, cypressCommand: "cy.visit('/dashboard')" },
			);

			const outputFile = path.join(socketDir, 'generated', 'flow.cy.ts');
			const client = await connectClient(daemon.socketPath);
			const responsePromise = new Promise<Record<string, unknown>>(
				(resolve) => {
					client.onMessage((msg) => {
						resolve(msg as Record<string, unknown>);
					});
				},
			);

			const exportCmd: CommandMessage = {
				id: 12,
				method: 'run',
				params: {
					args: { _: ['export'], file: outputFile },
				},
			};
			client.send(exportCmd);

			const response = await responsePromise;
			expect(response.id).toBe(12);
			const result = response.result as Record<string, unknown>;
			expect(result.success).toBe(true);
			expect(result.filePath).toBe(outputFile);

			const written = await fs.readFile(outputFile, 'utf-8');
			expect(written).toContain("cy.visit('/dashboard');");
			expect(written).toContain('/// <reference types="cypress" />');

			client.close();
			await daemon.stop();
		});

		it('export command returns error when no session is running', async () => {
			daemon = new Daemon({
				sessionId: 'test-export-no-session',
				socketDir,
				idleTimeout: 0,
			});

			await daemon.start();

			const client = await connectClient(daemon.socketPath);

			const responsePromise = new Promise<Record<string, unknown>>(
				(resolve) => {
					client.onMessage((msg) => {
						resolve(msg as Record<string, unknown>);
					});
				},
			);

			const exportCmd: CommandMessage = {
				id: 11,
				method: 'run',
				params: { args: { _: ['export'] } },
			};
			client.send(exportCmd);

			const response = await responsePromise;
			expect(response.id).toBe(11);
			expect(response.error).toContain('No session running');

			client.close();
			await daemon.stop();
		});
	});
});

// ---------------------------------------------------------------------------
// resolveSocketDir
// ---------------------------------------------------------------------------

describe('resolveSocketDir', () => {
	it('uses XDG_RUNTIME_DIR when set', () => {
		const original = process.env['XDG_RUNTIME_DIR'];
		try {
			process.env['XDG_RUNTIME_DIR'] = '/run/user/1000';
			const dir = resolveSocketDir();
			expect(dir).toBe('/run/user/1000/cypress-cli');
		} finally {
			if (original !== undefined) {
				process.env['XDG_RUNTIME_DIR'] = original;
			} else {
				delete process.env['XDG_RUNTIME_DIR'];
			}
		}
	});

	it('falls back to TMPDIR when XDG_RUNTIME_DIR is unset', () => {
		const originalXdg = process.env['XDG_RUNTIME_DIR'];
		const originalTmp = process.env['TMPDIR'];
		try {
			delete process.env['XDG_RUNTIME_DIR'];
			process.env['TMPDIR'] = '/tmp/test';
			const dir = resolveSocketDir();
			expect(dir).toBe('/tmp/test/cypress-cli');
		} finally {
			if (originalXdg !== undefined)
				process.env['XDG_RUNTIME_DIR'] = originalXdg;
			else delete process.env['XDG_RUNTIME_DIR'];
			if (originalTmp !== undefined) process.env['TMPDIR'] = originalTmp;
			else delete process.env['TMPDIR'];
		}
	});
});

// ---------------------------------------------------------------------------
// isSocketAlive
// ---------------------------------------------------------------------------

describe('isSocketAlive', () => {
	let socketDir: string;
	let daemon: Daemon;

	beforeEach(async () => {
		socketDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cypress-cli-alive-'));
	});

	afterEach(async () => {
		if (daemon) {
			await daemon.stop();
		}
		await fs.rm(socketDir, { recursive: true, force: true }).catch(() => {});
	});

	it('returns true for a live daemon socket', async () => {
		daemon = new Daemon({
			sessionId: 'alive-test',
			socketDir,
			idleTimeout: 0,
			sessionInactivityTimeout: 0,
		});
		await daemon.start();
		expect(await isSocketAlive(daemon.socketPath)).toBe(true);
	});

	it('returns false for a stale socket file', async () => {
		const staleSocket = path.join(socketDir, 'stale.sock');
		await fs.writeFile(staleSocket, '');
		expect(await isSocketAlive(staleSocket)).toBe(false);
	});

	it('returns false for a non-existent path', async () => {
		expect(await isSocketAlive(path.join(socketDir, 'nope.sock'))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// cleanStaleSockets
// ---------------------------------------------------------------------------

describe('cleanStaleSockets', () => {
	let socketDir: string;
	let daemon: Daemon;

	beforeEach(async () => {
		socketDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cypress-cli-clean-'));
	});

	afterEach(async () => {
		if (daemon) {
			await daemon.stop();
		}
		await fs.rm(socketDir, { recursive: true, force: true }).catch(() => {});
	});

	it('removes stale socket files and returns cleaned session IDs', async () => {
		// Create some stale socket files (no listener)
		await fs.writeFile(path.join(socketDir, 'session-a.sock'), '');
		await fs.writeFile(path.join(socketDir, 'session-b.sock'), '');

		const cleaned = await cleanStaleSockets(socketDir);
		expect(cleaned).toContain('session-a');
		expect(cleaned).toContain('session-b');

		// Stale files should be removed
		const entries = await fs.readdir(socketDir);
		expect(entries.filter((e: string) => e.endsWith('.sock'))).toHaveLength(0);
	});

	it('preserves live sockets', async () => {
		daemon = new Daemon({
			sessionId: 'live',
			socketDir,
			idleTimeout: 0,
			sessionInactivityTimeout: 0,
		});
		await daemon.start();

		// Add a stale socket alongside the live one
		await fs.writeFile(path.join(socketDir, 'dead.sock'), '');

		const cleaned = await cleanStaleSockets(socketDir);
		expect(cleaned).toContain('dead');
		expect(cleaned).not.toContain('live');

		// Live socket should still exist
		const entries = await fs.readdir(socketDir);
		expect(entries).toContain('live.sock');
	});

	it('returns empty array when socket directory does not exist', async () => {
		const cleaned = await cleanStaleSockets(
			'/tmp/nonexistent-cypress-cli-test-dir',
		);
		expect(cleaned).toEqual([]);
	});

	it('ignores non-sock files', async () => {
		await fs.writeFile(path.join(socketDir, 'readme.txt'), 'hello');
		await fs.writeFile(path.join(socketDir, 'stale.sock'), '');

		const cleaned = await cleanStaleSockets(socketDir);
		expect(cleaned).toEqual(['stale']);

		// Non-sock file should still exist
		const entries = await fs.readdir(socketDir);
		expect(entries).toContain('readme.txt');
	});
});

// ---------------------------------------------------------------------------
// Snapshot-to-file (Issue #45)
// ---------------------------------------------------------------------------

describe('Daemon snapshotDir', () => {
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

	it('defaults snapshotDir to .cypress-cli/ in cwd', () => {
		daemon = new Daemon({
			sessionId: 'snap-default',
			socketDir,
			idleTimeout: 0,
		});
		expect(daemon.snapshotDir).toBe(path.join(process.cwd(), '.cypress-cli'));
	});

	it('uses custom snapshotDir when provided', () => {
		daemon = new Daemon({
			sessionId: 'snap-custom',
			socketDir,
			idleTimeout: 0,
			snapshotDir,
		});
		expect(daemon.snapshotDir).toBe(snapshotDir);
	});

	it('writes snapshot file and includes filePath in response', async () => {
		daemon = new Daemon({
			sessionId: 'snap-write',
			socketDir,
			idleTimeout: 0,
			snapshotDir,
		});

		await daemon.start();
		const session = daemon.createSession({ id: 'snap-session' });
		session.transition('running');

		const client = await connectClient(daemon.socketPath);

		// Enqueue a command that will produce a result with a snapshot
		const clickCmd: CommandMessage = {
			id: 1,
			method: 'run',
			params: { args: { _: ['click', 'e5'] } },
		};
		client.send(clickCmd);

		// Simulate Cypress plugin side: dequeue the command, then report result
		const command = await session.queue.dequeue();
		expect(command.action).toBe('click');
		session.queue.reportResult({
			success: true,
			snapshot: '- button "Submit"',
			selector: '#btn',
			cypressCommand: "cy.get('#btn').click()",
		});

		const response = await new Promise<Record<string, unknown>>((resolve) => {
			client.onMessage((msg) => {
				resolve(msg as Record<string, unknown>);
			});
		});

		const result = response['result'] as Record<string, unknown>;
		expect(result['success']).toBe(true);
		expect(result['snapshot']).toBe('- button "Submit"');
		expect(result['cypressCommand']).toBe("cy.get('#btn').click()");
		expect(typeof result['filePath']).toBe('string');

		// Verify the file was actually written
		const snapFiles = await fs.readdir(snapshotDir);
		expect(snapFiles.length).toBe(1);
		expect(snapFiles[0]).toMatch(/^page-.*\.yml$/);

		const content = await fs.readFile(
			path.join(snapshotDir, snapFiles[0]),
			'utf-8',
		);
		expect(content).toBe('- button "Submit"');

		client.close();
	});

	it('uses --filename option when provided for snapshot command', async () => {
		daemon = new Daemon({
			sessionId: 'snap-filename',
			socketDir,
			idleTimeout: 0,
			snapshotDir,
		});

		await daemon.start();
		const session = daemon.createSession({ id: 'snap-session-2' });
		session.transition('running');

		const client = await connectClient(daemon.socketPath);

		// Send a snapshot command with --filename
		const snapshotCmd: CommandMessage = {
			id: 1,
			method: 'run',
			params: { args: { _: ['snapshot'], filename: 'custom.yml' } },
		};
		client.send(snapshotCmd);

		const command = await session.queue.dequeue();
		expect(command.action).toBe('snapshot');
		session.queue.reportResult({
			success: true,
			snapshot: '- heading "Dashboard"',
		});

		const response = await new Promise<Record<string, unknown>>((resolve) => {
			client.onMessage((msg) => {
				resolve(msg as Record<string, unknown>);
			});
		});

		const result = response['result'] as Record<string, unknown>;
		expect(typeof result['filePath']).toBe('string');
		expect(String(result['filePath'])).toContain('custom.yml');

		// Verify custom filename
		const content = await fs.readFile(
			path.join(snapshotDir, 'custom.yml'),
			'utf-8',
		);
		expect(content).toBe('- heading "Dashboard"');

		client.close();
	});
});
