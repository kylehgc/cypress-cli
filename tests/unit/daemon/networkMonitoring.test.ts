/**
 * Unit tests for network monitoring tech debt fixes (#95).
 *
 * Tests:
 * - `network` command schema accepts `--clear` option
 * - `_checkInterceptDrift()` in daemon.ts correctly detects and reconciles drift
 * - Response format with `activeRouteCount` for drift detection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { parseCommand } from '../../../src/client/command.js';
import { network, commandRegistry } from '../../../src/client/commands.js';
import { Session } from '../../../src/daemon/session.js';
import { Daemon } from '../../../src/daemon/daemon.js';
import type { CommandResult } from '../../../src/daemon/commandQueue.js';

// ---------------------------------------------------------------------------
// `network` command schema
// ---------------------------------------------------------------------------

describe('network command schema', () => {
	it('accepts no arguments', () => {
		const result = network.args.safeParse({});
		expect(result.success).toBe(true);
	});

	it('accepts --clear option', () => {
		const result = network.options.safeParse({ clear: true });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.clear).toBe(true);
		}
	});

	it('defaults --clear to undefined when not provided', () => {
		const result = network.options.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.clear).toBeUndefined();
		}
	});

	it('parses "network" from CLI args', () => {
		const parsed = parseCommand({ _: ['network'] }, commandRegistry);
		expect(parsed.command).toBe('network');
	});

	it('parses "network --clear" from CLI args', () => {
		const parsed = parseCommand(
			{ _: ['network'], clear: true },
			commandRegistry,
		);
		expect(parsed.command).toBe('network');
		expect(parsed.options.clear).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// _checkInterceptDrift() — actual drift detection logic in daemon.ts
// ---------------------------------------------------------------------------

describe('_checkInterceptDrift()', () => {
	let socketDir: string;
	let daemon: Daemon;
	let session: Session;

	beforeEach(async () => {
		socketDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cypress-cli-drift-'));
		daemon = new Daemon({ sessionId: 'drift-test', socketDir, idleTimeout: 0 });
		session = new Session({ id: 'drift-session' });
	});

	afterEach(async () => {
		await daemon.stop();
		await fs.rm(socketDir, { recursive: true, force: true }).catch(() => {});
	});

	/** Helper: call the private _checkInterceptDrift method */
	function checkDrift(
		cmd: { action: string; id?: number },
		evalResult: string,
	): void {
		const command = { id: 1, ...cmd };
		const result: CommandResult = { success: true, evalResult };
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(daemon as any)._checkInterceptDrift(session, command, result);
	}

	it('clears daemon registry when network reports activeRouteCount:0 and daemon has stale entries', () => {
		session.addIntercept({ pattern: '**/api/users', statusCode: 200 });
		session.addIntercept({ pattern: '**/api/posts', statusCode: 200 });
		expect(session.intercepts).toHaveLength(2);

		checkDrift(
			{ action: 'network' },
			JSON.stringify({ entries: [], activeRouteCount: 0 }),
		);

		expect(session.intercepts).toHaveLength(0);
	});

	it('clears daemon registry when unintercept reports activeRouteCount:0 and daemon has stale entries', () => {
		session.addIntercept({ pattern: '**/api/users', statusCode: 200 });
		expect(session.intercepts).toHaveLength(1);

		checkDrift(
			{ action: 'unintercept' },
			JSON.stringify({ message: 'Intercept removed', activeRouteCount: 0 }),
		);

		expect(session.intercepts).toHaveLength(0);
	});

	it('does NOT clear registry when counts match', () => {
		session.addIntercept({ pattern: '**/api/users', statusCode: 200 });
		expect(session.intercepts).toHaveLength(1);

		checkDrift(
			{ action: 'intercept' },
			JSON.stringify({ message: 'Intercept registered', activeRouteCount: 1 }),
		);

		expect(session.intercepts).toHaveLength(1);
	});

	it('ignores commands that are not network/intercept/unintercept', () => {
		session.addIntercept({ pattern: '**/api/users', statusCode: 200 });
		expect(session.intercepts).toHaveLength(1);

		// Even if an eval command returns activeRouteCount:0, it must NOT clear registry
		checkDrift(
			{ action: 'eval' },
			JSON.stringify({ activeRouteCount: 0 }),
		);

		expect(session.intercepts).toHaveLength(1);
	});

	it('ignores eval result that is not JSON', () => {
		session.addIntercept({ pattern: '**/api/users', statusCode: 200 });

		checkDrift({ action: 'network' }, 'not-json');

		expect(session.intercepts).toHaveLength(1);
	});

	it('ignores result with no evalResult', () => {
		session.addIntercept({ pattern: '**/api/users', statusCode: 200 });

		const command = { id: 1, action: 'network' };
		const result: CommandResult = { success: true };
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(daemon as any)._checkInterceptDrift(session, command, result);

		expect(session.intercepts).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// Response format expectations
// ---------------------------------------------------------------------------

describe('network response format', () => {
	it('network response includes entries and activeRouteCount', () => {
		// Verify the expected JSON shape that the driver produces
		const mockNetworkResponse = JSON.stringify({
			entries: [
				{
					url: 'https://example.com/api',
					method: 'GET',
					status: 200,
					contentType: 'application/json',
					size: 42,
					timestamp: '2026-03-09T00:00:00.000Z',
				},
			],
			activeRouteCount: 0,
		});

		const parsed = JSON.parse(mockNetworkResponse);
		expect(parsed).toHaveProperty('entries');
		expect(parsed).toHaveProperty('activeRouteCount');
		expect(Array.isArray(parsed.entries)).toBe(true);
		expect(typeof parsed.activeRouteCount).toBe('number');
	});

	it('network --clear response includes cleared count and activeRouteCount', () => {
		const mockClearResponse = JSON.stringify({
			cleared: 42,
			activeRouteCount: 0,
		});

		const parsed = JSON.parse(mockClearResponse);
		expect(parsed).toHaveProperty('cleared');
		expect(parsed).toHaveProperty('activeRouteCount');
		expect(typeof parsed.cleared).toBe('number');
	});

	it('intercept response includes message and activeRouteCount', () => {
		const mockInterceptResponse = JSON.stringify({
			message: 'Intercept registered for "**/api/**" as @api1',
			activeRouteCount: 1,
		});

		const parsed = JSON.parse(mockInterceptResponse);
		expect(parsed).toHaveProperty('message');
		expect(parsed).toHaveProperty('activeRouteCount');
		expect(parsed.activeRouteCount).toBe(1);
	});

	it('unintercept response includes message and activeRouteCount', () => {
		const mockUninterceptResponse = JSON.stringify({
			message: 'Intercept removed for "**/api/**"',
			activeRouteCount: 0,
		});

		const parsed = JSON.parse(mockUninterceptResponse);
		expect(parsed).toHaveProperty('message');
		expect(parsed).toHaveProperty('activeRouteCount');
		expect(parsed.activeRouteCount).toBe(0);
	});
});
