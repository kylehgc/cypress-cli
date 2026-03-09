/**
 * E2E test: network monitoring and route mocking commands.
 *
 * Tests the `network`, `intercept`, `intercept-list`, and `unintercept`
 * commands through the full CLI → Daemon → Cypress → Browser pipeline.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
	setupE2E,
	isSuccess,
	getEvalResult,
	type E2EContext,
} from './helpers.js';

describe('E2E: network', () => {
	let ctx: E2EContext;

	beforeAll(async () => {
		ctx = await setupE2E('/api.html');
	}, 60_000);

	afterAll(async () => {
		await ctx?.teardown();
	}, 30_000);

	it('captures network requests via passive monitor', async () => {
		// The initial page load should have been captured
		const response = await ctx.sendCommand(100, ['network']);
		expect(isSuccess(response)).toBe(true);

		const evalResult = getEvalResult(response);
		expect(evalResult).toBeTruthy();

		// Should be a JSON array of network entries
		const entries = JSON.parse(evalResult!);
		expect(Array.isArray(entries)).toBe(true);
		expect(entries.length).toBeGreaterThan(0);

		// Each entry should have the expected shape
		const entry = entries[0];
		expect(entry).toHaveProperty('url');
		expect(entry).toHaveProperty('method');
		expect(entry).toHaveProperty('status');
		expect(entry).toHaveProperty('contentType');
		expect(entry).toHaveProperty('timestamp');
	}, 60_000);

	it('intercepts and mocks a network response', async () => {
		// Set up intercept to mock /api/users with custom response
		const interceptRes = await ctx.sendCommand(
			101,
			['intercept', '**/api/users'],
			{
				status: 200,
				body: '{"users":[{"name":"MockUser"}]}',
				'content-type': 'application/json',
			},
		);
		expect(isSuccess(interceptRes)).toBe(true);

		const evalResult = getEvalResult(interceptRes);
		expect(evalResult).toContain('Intercept registered');
	}, 60_000);

	it('intercept-list returns active mocks', async () => {
		const listRes = await ctx.sendCommand(102, ['intercept-list']);
		expect(isSuccess(listRes)).toBe(true);

		const evalResult = getEvalResult(listRes);
		expect(evalResult).toBeTruthy();

		const intercepts = JSON.parse(evalResult!);
		expect(Array.isArray(intercepts)).toBe(true);
		expect(intercepts.length).toBeGreaterThan(0);
		expect(intercepts[0].pattern).toBe('**/api/users');
	}, 60_000);

	it('unintercept removes a mock', async () => {
		const uninterceptRes = await ctx.sendCommand(103, [
			'unintercept',
			'**/api/users',
		]);
		expect(isSuccess(uninterceptRes)).toBe(true);

		const evalResult = getEvalResult(uninterceptRes);
		expect(evalResult).toContain('Intercept removed');

		// Verify intercept-list is now empty
		const listRes = await ctx.sendCommand(104, ['intercept-list']);
		expect(isSuccess(listRes)).toBe(true);
		const listResult = getEvalResult(listRes);
		const intercepts = JSON.parse(listResult!);
		expect(intercepts).toHaveLength(0);
	}, 60_000);
});
