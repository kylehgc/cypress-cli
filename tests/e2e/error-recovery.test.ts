/**
 * E2E test: error recovery through the full pipeline.
 *
 * Tests invalid selectors, unknown commands, missing arguments,
 * and Cypress actionability errors (disabled elements) to verify the
 * system returns graceful error responses instead of crashing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
	setupE2E,
	isError,
	isSuccess,
	getError,
	getSnapshot,
	type E2EContext,
} from './helpers.js';

describe('E2E: error recovery', () => {
	let ctx: E2EContext;

	beforeAll(async () => {
		ctx = await setupE2E('/simple.html');
	}, 60_000);

	afterAll(async () => {
		await ctx?.teardown();
	}, 30_000);

	it('returns error for click with invalid ref', async () => {
		const response = await ctx.sendCommand(70, ['click', 'e9999']);
		expect(isError(response)).toBe(true);

		const error = getError(response);
		expect(error.length).toBeGreaterThan(0);
	}, 60_000);

	it('returns error for type with missing text argument', async () => {
		const response = await ctx.sendCommand(71, ['type', 'e1']);
		expect(isError(response)).toBe(true);

		const error = getError(response);
		// Pre-flight validation rejects <html> as a type target before
		// the "requires text" check runs in executeCommand.
		expect(error).toContain('type');
	}, 60_000);

	it('returns error for unknown command action', async () => {
		const response = await ctx.sendCommand(72, ['unknowncommand', 'e1']);
		expect(isError(response)).toBe(true);

		const error = getError(response);
		expect(error).toContain('Unknown command');
	}, 60_000);

	it('recovers after an error and accepts new commands', async () => {
		// First, cause an error
		const errorResponse = await ctx.sendCommand(73, ['click', 'e9999']);
		expect(isError(errorResponse)).toBe(true);

		// Then, verify the system is still operational by taking a snapshot
		const snapResponse = await ctx.sendCommand(74, ['snapshot']);
		expect(isSuccess(snapResponse)).toBe(true);
	}, 60_000);

	it('returns error for assert on non-existent ref', async () => {
		const response = await ctx.sendCommand(
			75,
			['assert', 'e9999', 'some text'],
			{ chainer: 'have.text' },
		);
		expect(isError(response)).toBe(true);
	}, 60_000);

	it('returns error for empty command args', async () => {
		const response = await ctx.sendCommand(76, []);
		expect(isError(response)).toBe(true);

		const error = getError(response);
		expect(error).toContain('No command specified');
	}, 60_000);
});

describe('E2E: Layer 2 recovery (disabled elements)', () => {
	let ctx: E2EContext;

	beforeAll(async () => {
		ctx = await setupE2E('/disabled.html');
	}, 60_000);

	afterAll(async () => {
		await ctx?.teardown();
	}, 30_000);

	it('returns error when typing into a disabled input', async () => {
		// Take snapshot to get refs
		const snapResponse = await ctx.sendCommand(80, ['snapshot']);
		expect(isSuccess(snapResponse)).toBe(true);
		const snapshot = getSnapshot(snapResponse);
		// Find the disabled input ref (textbox "Disabled input" [disabled])
		const match = snapshot.match(
			/textbox "Disabled input" \[disabled\] \[ref=(e\d+)\]/,
		);
		expect(match).not.toBeNull();
		const disabledRef = match![1];

		// Try to type into the disabled input — triggers Cypress.once('fail')
		// recovery. Should return an error with snapshot, not crash the session.
		const response = await ctx.sendCommand(81, ['type', disabledRef, 'hello']);
		expect(isError(response)).toBe(true);
		const error = getError(response);
		expect(error).toContain('disabled');
	}, 60_000);

	it('session survives after typing into disabled element', async () => {
		// After the Layer 2 recovery, the session should still be alive.
		// Verify by taking a snapshot and running a normal command.
		const snapResponse = await ctx.sendCommand(82, ['snapshot']);
		expect(isSuccess(snapResponse)).toBe(true);
		const snapshot = getSnapshot(snapResponse);
		// Page state preserved — we're still on disabled.html
		expect(snapshot).toContain('Disabled Elements');
	}, 60_000);

	it('normal commands work after multiple recoveries', async () => {
		// Find the enabled input ref
		const snapResponse = await ctx.sendCommand(83, ['snapshot']);
		expect(isSuccess(snapResponse)).toBe(true);
		const snapshot = getSnapshot(snapResponse);
		const match = snapshot.match(/textbox "Enabled input"[^[]*\[ref=(e\d+)\]/);
		expect(match).not.toBeNull();
		const enabledRef = match![1];

		// Type into the enabled input — should work normally
		const typeResponse = await ctx.sendCommand(84, [
			'type',
			enabledRef,
			'works',
		]);
		expect(isSuccess(typeResponse)).toBe(true);
	}, 60_000);
});
