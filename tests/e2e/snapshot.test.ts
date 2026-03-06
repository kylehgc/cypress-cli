/**
 * E2E test: aria snapshot capture through the full pipeline.
 *
 * Launches a real Cypress instance against a fixture HTML page,
 * takes an aria snapshot, and verifies the YAML output matches
 * the expected structure.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
	setupE2E,
	getSnapshot,
	isSuccess,
	type E2EContext,
} from './helpers.js';

describe('E2E: snapshot', () => {
	let ctx: E2EContext;

	beforeAll(async () => {
		ctx = await setupE2E('/simple.html');
	}, 60_000);

	afterAll(async () => {
		await ctx?.teardown();
	}, 30_000);

	it('returns a YAML aria snapshot of the page', async () => {
		const response = await ctx.sendCommand(10, ['snapshot']);
		expect(isSuccess(response)).toBe(true);

		const snapshot = getSnapshot(response);
		expect(snapshot.length).toBeGreaterThan(0);

		// The simple.html page has a heading "Welcome"
		expect(snapshot).toContain('Welcome');
	}, 60_000);

	it('snapshot contains interactive elements with refs', async () => {
		const response = await ctx.sendCommand(11, ['snapshot']);
		expect(isSuccess(response)).toBe(true);

		const snapshot = getSnapshot(response);

		// Should contain buttons from simple.html
		expect(snapshot).toContain('Say Hello');
		expect(snapshot).toContain('Click me');
	}, 60_000);

	it('snapshot is valid YAML-like structure with indentation', async () => {
		const response = await ctx.sendCommand(12, ['snapshot']);
		expect(isSuccess(response)).toBe(true);

		const snapshot = getSnapshot(response);

		// YAML-like structure uses "- " prefix for tree nodes
		expect(snapshot).toMatch(/^- /m);
	}, 60_000);
});
