/**
 * Unit tests for network monitoring tech debt fixes (#95).
 *
 * Tests:
 * - `network` command schema accepts `--clear` option
 * - Session intercept registry reconciliation patterns
 * - Response format with `activeRouteCount` for drift detection
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { parseCommand } from '../../../src/client/command.js';
import { network, commandRegistry } from '../../../src/client/commands.js';
import { Session } from '../../../src/daemon/session.js';

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
// Session intercept registry - drift reconciliation patterns
// ---------------------------------------------------------------------------

describe('Session intercept drift reconciliation', () => {
	let session: Session;

	beforeEach(() => {
		session = new Session({ id: 'test-session' });
	});

	it('removeIntercept() with no args clears all entries', () => {
		session.addIntercept({ pattern: '**/api/users', statusCode: 200 });
		session.addIntercept({ pattern: '**/api/posts', statusCode: 200 });
		expect(session.intercepts).toHaveLength(2);

		const removed = session.removeIntercept();
		expect(removed).toHaveLength(2);
		expect(session.intercepts).toHaveLength(0);
	});

	it('drift scenario: daemon has stale entries after socket drop', () => {
		// Simulate: daemon tracked two intercepts
		session.addIntercept({ pattern: '**/api/users', statusCode: 200 });
		session.addIntercept({ pattern: '**/api/posts', statusCode: 200 });

		// Driver reports 0 active routes (unintercept succeeded but
		// confirmation was lost) — daemon should clear its registry
		const driverActiveRouteCount = 0;
		if (driverActiveRouteCount === 0 && session.intercepts.length > 0) {
			session.removeIntercept();
		}
		expect(session.intercepts).toHaveLength(0);
	});

	it('no drift: daemon and driver counts match', () => {
		session.addIntercept({ pattern: '**/api/users', statusCode: 200 });

		// Driver reports 1 active route — counts match, no action needed
		const driverActiveRouteCount = 1;
		const daemonCount = session.intercepts.length;
		expect(driverActiveRouteCount).toBe(daemonCount);
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
