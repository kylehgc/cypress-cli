import { describe, it, expect } from 'vitest';

import {
	parseDaemonProcessArgs,
	seedInitialNavigateHistory,
} from '../../../src/daemon/main.js';
import { Session } from '../../../src/daemon/session.js';

describe('daemon main', () => {
	describe('parseDaemonProcessArgs', () => {
		it('parses a valid idle-timeout value', () => {
			const opts = parseDaemonProcessArgs(['--idle-timeout', '30000']);
			expect(opts.idleTimeout).toBe(30000);
		});

		it('throws for a non-numeric idle-timeout value', () => {
			expect(() => parseDaemonProcessArgs(['--idle-timeout', 'abc'])).toThrow(
				/Invalid --idle-timeout value/,
			);
		});

		it('throws for an Infinity idle-timeout value', () => {
			expect(() =>
				parseDaemonProcessArgs(['--idle-timeout', 'Infinity']),
			).toThrow(/Invalid --idle-timeout value/);
		});

		it('omits idleTimeout when the flag is absent', () => {
			const opts = parseDaemonProcessArgs([]);
			expect(opts.idleTimeout).toBeUndefined();
		});

		it('parses a valid session-inactivity-timeout value', () => {
			const opts = parseDaemonProcessArgs([
				'--session-inactivity-timeout',
				'60000',
			]);
			expect(opts.sessionInactivityTimeout).toBe(60000);
		});

		it('throws for a non-numeric session-inactivity-timeout value', () => {
			expect(() =>
				parseDaemonProcessArgs(['--session-inactivity-timeout', 'abc']),
			).toThrow(/Invalid --session-inactivity-timeout value/);
		});

		it('omits sessionInactivityTimeout when the flag is absent', () => {
			const opts = parseDaemonProcessArgs([]);
			expect(opts.sessionInactivityTimeout).toBeUndefined();
		});

		it('parses --snapshot-dir option', () => {
			const opts = parseDaemonProcessArgs(['--snapshot-dir', '/tmp/snapshots']);
			expect(opts.snapshotDir).toBe('/tmp/snapshots');
		});

		it('omits snapshotDir when the flag is absent', () => {
			const opts = parseDaemonProcessArgs([]);
			expect(opts.snapshotDir).toBeUndefined();
		});
	});

	describe('seedInitialNavigateHistory', () => {
		it('records an initial navigate entry for open-created sessions', () => {
			const session = new Session({
				id: 'seeded-session',
				url: 'https://example.com/dashboard',
			});

			seedInitialNavigateHistory(session, {});

			expect(session.commandHistory).toHaveLength(1);
			expect(session.commandHistory[0].command).toMatchObject({
				action: 'navigate',
				text: 'https://example.com/dashboard',
			});
			expect(session.commandHistory[0].result).toMatchObject({
				success: true,
				cypressCommand: "cy.visit('https://example.com/dashboard')",
			});
		});

		it('does not duplicate navigate history or seed resumed sessions', () => {
			const session = new Session({
				id: 'existing-session',
				url: 'https://example.com/dashboard',
			});

			seedInitialNavigateHistory(session, {});
			seedInitialNavigateHistory(session, {});
			seedInitialNavigateHistory(session, { resume: 'existing-session' });

			expect(session.commandHistory).toHaveLength(1);
		});
	});
});
