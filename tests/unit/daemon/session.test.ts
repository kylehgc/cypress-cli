import { describe, it, expect, beforeEach } from 'vitest';

import {
	Session,
	SessionMap,
	SessionError,
	type SessionConfig,
	type SessionState,
} from '../../../src/daemon/session.js';
import type { QueuedCommand } from '../../../src/daemon/commandQueue.js';

// ---------------------------------------------------------------------------
// Session: state machine transitions
// ---------------------------------------------------------------------------

describe('Session', () => {
	let session: Session;

	beforeEach(() => {
		session = new Session({ id: 'test-session', url: 'http://localhost:3000' });
	});

	describe('state transitions', () => {
		it('starts in "waiting" state', () => {
			expect(session.state).toBe('waiting');
		});

		it('transitions waiting → running', () => {
			session.transition('running');
			expect(session.state).toBe('running');
		});

		it('transitions waiting → stopped', () => {
			session.transition('stopped');
			expect(session.state).toBe('stopped');
		});

		it('transitions running → paused', () => {
			session.transition('running');
			session.transition('paused');
			expect(session.state).toBe('paused');
		});

		it('transitions running → stopped', () => {
			session.transition('running');
			session.transition('stopped');
			expect(session.state).toBe('stopped');
		});

		it('transitions paused → running', () => {
			session.transition('running');
			session.transition('paused');
			session.transition('running');
			expect(session.state).toBe('running');
		});

		it('transitions paused → stopped', () => {
			session.transition('running');
			session.transition('paused');
			session.transition('stopped');
			expect(session.state).toBe('stopped');
		});

		it('rejects invalid transition waiting → paused', () => {
			expect(() => session.transition('paused')).toThrow(SessionError);
			expect(() => session.transition('paused')).toThrow('Invalid state transition');
		});

		it('rejects transitions from stopped', () => {
			session.transition('stopped');
			expect(() => session.transition('running')).toThrow(SessionError);
			expect(() => session.transition('waiting' as SessionState)).toThrow(SessionError);
		});

		it('rejects self-transitions to same state', () => {
			// waiting → waiting is not in VALID_TRANSITIONS
			expect(() => session.transition('waiting')).toThrow(SessionError);
		});

		it('disposes the queue when transitioning to stopped', () => {
			session.transition('running');
			expect(session.queue.isDisposed).toBe(false);

			session.transition('stopped');
			expect(session.queue.isDisposed).toBe(true);
		});
	});

	// -----------------------------------------------------------------------
	// Command queue delegation
	// -----------------------------------------------------------------------

	describe('command queue delegation', () => {
		it('enqueues commands when running', async () => {
			session.transition('running');

			const command: QueuedCommand = { id: 1, action: 'click', ref: 'e5' };
			const resultPromise = session.enqueueCommand(command);

			const dequeued = await session.dequeueCommand();
			expect(dequeued).toEqual(command);

			session.reportResult({ success: true, snapshot: '...' });
			const result = await resultPromise;
			expect(result.success).toBe(true);
		});

		it('rejects enqueue when not running', () => {
			expect(() => session.enqueueCommand({ id: 1, action: 'click', ref: 'e1' }))
				.toThrow(SessionError);
			expect(() => session.enqueueCommand({ id: 1, action: 'click', ref: 'e1' }))
				.toThrow('session is "waiting"');
		});

		it('rejects enqueue when stopped', () => {
			session.transition('stopped');
			expect(() => session.enqueueCommand({ id: 1, action: 'click', ref: 'e1' }))
				.toThrow(SessionError);
			expect(() => session.enqueueCommand({ id: 1, action: 'click', ref: 'e1' }))
				.toThrow('session is "stopped"');
		});

		it('rejects dequeue when not running', () => {
			expect(() => session.dequeueCommand()).toThrow(SessionError);
			expect(() => session.dequeueCommand()).toThrow('session is "waiting"');
		});
	});

	// -----------------------------------------------------------------------
	// Command history
	// -----------------------------------------------------------------------

	describe('command history', () => {
		it('records command history', () => {
			const command: QueuedCommand = { id: 1, action: 'click', ref: 'e5' };
			const result = { success: true, snapshot: '...' };

			session.recordHistory(command, result);
			expect(session.commandHistory).toHaveLength(1);
			expect(session.commandHistory[0]).toMatchObject({ command, result });
			expect(session.commandHistory[0]).toHaveProperty('executedAt');
			expect(session.commandHistory[0]).toHaveProperty('index', 0);
		});

		it('maintains order in history', () => {
			session.recordHistory(
				{ id: 1, action: 'click', ref: 'e1' },
				{ success: true },
			);
			session.recordHistory(
				{ id: 2, action: 'type', ref: 'e2', text: 'hello' },
				{ success: true },
			);

			expect(session.commandHistory).toHaveLength(2);
			expect(session.commandHistory[0].command.action).toBe('click');
			expect(session.commandHistory[1].command.action).toBe('type');
		});
	});

	// -----------------------------------------------------------------------
	// Accessors
	// -----------------------------------------------------------------------

	describe('accessors', () => {
		it('exposes session id', () => {
			expect(session.id).toBe('test-session');
		});

		it('exposes session config', () => {
			expect(session.config.url).toBe('http://localhost:3000');
			expect(session.config.id).toBe('test-session');
		});

		it('config is frozen', () => {
			expect(() => {
				(session.config as Record<string, unknown>).url = 'http://evil.com';
			}).toThrow();
		});

		it('exposes createdAt timestamp', () => {
			const now = Date.now();
			expect(session.createdAt).toBeLessThanOrEqual(now);
			expect(session.createdAt).toBeGreaterThan(now - 1000);
		});

		it('tracks pending count', async () => {
			session.transition('running');
			expect(session.pendingCount).toBe(0);

			session.enqueueCommand({ id: 1, action: 'click', ref: 'e1' });
			expect(session.pendingCount).toBe(1);

			await session.dequeueCommand();
			expect(session.pendingCount).toBe(0);
		});

		it('tracks inflight status', async () => {
			session.transition('running');
			expect(session.hasInflight).toBe(false);

			session.enqueueCommand({ id: 1, action: 'click', ref: 'e1' });
			await session.dequeueCommand();
			expect(session.hasInflight).toBe(true);

			session.reportResult({ success: true });
			expect(session.hasInflight).toBe(false);
		});
	});
});

// ---------------------------------------------------------------------------
// SessionMap
// ---------------------------------------------------------------------------

describe('SessionMap', () => {
	let map: SessionMap;

	beforeEach(() => {
		map = new SessionMap();
	});

	it('creates and retrieves a session', () => {
		const config: SessionConfig = { id: 'session-1', url: 'http://localhost:3000' };
		const session = map.create(config);

		expect(session.id).toBe('session-1');
		expect(map.get('session-1')).toBe(session);
		expect(map.has('session-1')).toBe(true);
	});

	it('rejects duplicate session IDs', () => {
		map.create({ id: 'session-1' });
		expect(() => map.create({ id: 'session-1' })).toThrow(SessionError);
		expect(() => map.create({ id: 'session-1' })).toThrow('already exists');
	});

	it('removes a session', () => {
		map.create({ id: 'session-1' });
		expect(map.remove('session-1')).toBe(true);
		expect(map.has('session-1')).toBe(false);
		expect(map.remove('session-1')).toBe(false);
	});

	it('returns undefined for unknown session', () => {
		expect(map.get('nonexistent')).toBeUndefined();
	});

	it('tracks session count', () => {
		expect(map.size).toBe(0);
		map.create({ id: 'a' });
		expect(map.size).toBe(1);
		map.create({ id: 'b' });
		expect(map.size).toBe(2);
		map.remove('a');
		expect(map.size).toBe(1);
	});

	it('lists session IDs', () => {
		map.create({ id: 'alpha' });
		map.create({ id: 'beta' });
		expect(map.ids).toEqual(expect.arrayContaining(['alpha', 'beta']));
	});

	it('stops all sessions', () => {
		const s1 = map.create({ id: 's1' });
		const s2 = map.create({ id: 's2' });
		s1.transition('running');
		s2.transition('running');

		map.stopAll();
		expect(s1.state).toBe('stopped');
		expect(s2.state).toBe('stopped');
		expect(map.size).toBe(0);
	});

	it('handles stopAll when sessions already stopped', () => {
		const s1 = map.create({ id: 's1' });
		s1.transition('stopped');

		expect(() => map.stopAll()).not.toThrow();
		expect(map.size).toBe(0);
	});
});
