/**
 * E2E test: navigation commands through the full pipeline.
 *
 * Navigates between fixture pages, goes back/forward,
 * and verifies URL changes via snapshots.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
	setupE2E,
	getSnapshot,
	isSuccess,
	type E2EContext,
} from './helpers.js';

describe('E2E: navigation', () => {
	let ctx: E2EContext;

	beforeAll(async () => {
		ctx = await setupE2E('/simple.html');
	}, 60_000);

	afterAll(async () => {
		await ctx?.teardown();
	}, 30_000);

	it('navigates to a different page via navigate command', async () => {
		const response = await ctx.sendCommand(
			20,
			['navigate', '_', `http://127.0.0.1:${ctx.port}/form.html`],
		);
		expect(isSuccess(response)).toBe(true);

		const snapshot = getSnapshot(response);
		// form.html has "Login Form" heading
		expect(snapshot).toContain('Login Form');
	}, 60_000);

	it('navigates back to the previous page', async () => {
		const response = await ctx.sendCommand(21, ['back']);
		expect(isSuccess(response)).toBe(true);

		const snapshot = getSnapshot(response);
		// Should be back on simple.html with "Welcome"
		expect(snapshot).toContain('Welcome');
	}, 60_000);

	it('navigates forward to the next page', async () => {
		const response = await ctx.sendCommand(22, ['forward']);
		expect(isSuccess(response)).toBe(true);

		const snapshot = getSnapshot(response);
		// Should be on form.html again
		expect(snapshot).toContain('Login Form');
	}, 60_000);

	it('reloads the current page', async () => {
		const response = await ctx.sendCommand(23, ['reload']);
		expect(isSuccess(response)).toBe(true);

		const snapshot = getSnapshot(response);
		// Should still be on form.html after reload
		expect(snapshot).toContain('Login Form');
	}, 60_000);

	it('navigates back to simple page for subsequent tests', async () => {
		const response = await ctx.sendCommand(
			24,
			['navigate', '_', `http://127.0.0.1:${ctx.port}/simple.html`],
		);
		expect(isSuccess(response)).toBe(true);

		const snapshot = getSnapshot(response);
		expect(snapshot).toContain('Welcome');
	}, 60_000);
});
