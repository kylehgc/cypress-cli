/**
 * E2E test: cookie management commands.
 *
 * Tests the `cookie-list`, `cookie-get`, `cookie-set`, `cookie-delete`, and
 * `cookie-clear` commands through the full CLI → Daemon → Cypress → Browser
 * pipeline.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
	setupE2E,
	isSuccess,
	getEvalResult,
	getError,
	type E2EContext,
} from './helpers.js';

describe('E2E: cookies', () => {
	let ctx: E2EContext;

	beforeAll(async () => {
		ctx = await setupE2E('/simple.html');
	}, 60_000);

	afterAll(async () => {
		await ctx?.teardown();
	}, 30_000);

	it('sets, gets, lists, deletes, and clears cookies without snapshots', async () => {
		const setResponse = await ctx.sendCommand(200, [
			'cookie-set',
			'agent-cookie',
			'hello world',
		]);
		expect(isSuccess(setResponse)).toBe(true);
		expect('result' in setResponse && setResponse.result.snapshot).toBeUndefined();
		expect('result' in setResponse && setResponse.result.cypressCommand).toBe(
			"cy.setCookie('agent-cookie', 'hello world')",
		);

		const setCookie = JSON.parse(getEvalResult(setResponse)!);
		expect(setCookie.name).toBe('agent-cookie');
		expect(setCookie.value).toBe('hello world');

		const getResponse = await ctx.sendCommand(201, ['cookie-get', 'agent-cookie']);
		expect(isSuccess(getResponse)).toBe(true);
		expect('result' in getResponse && getResponse.result.snapshot).toBeUndefined();
		expect('result' in getResponse && getResponse.result.cypressCommand).toBe(
			"cy.getCookie('agent-cookie')",
		);

		const fetchedCookie = JSON.parse(getEvalResult(getResponse)!);
		expect(fetchedCookie.name).toBe('agent-cookie');
		expect(fetchedCookie.value).toBe('hello world');

		const listResponse = await ctx.sendCommand(202, ['cookie-list'], {
			domain: '127.0.0.1',
		});
		expect(isSuccess(listResponse)).toBe(true);
		expect('result' in listResponse && listResponse.result.snapshot).toBeUndefined();

		const cookies = JSON.parse(getEvalResult(listResponse)!);
		expect(Array.isArray(cookies)).toBe(true);
		expect(cookies.some((cookie: { name: string }) => cookie.name === 'agent-cookie')).toBe(
			true,
		);

		const deleteResponse = await ctx.sendCommand(203, [
			'cookie-delete',
			'agent-cookie',
		]);
		expect(isSuccess(deleteResponse)).toBe(true);
		expect('result' in deleteResponse && deleteResponse.result.snapshot).toBeUndefined();

		const deleted = JSON.parse(getEvalResult(deleteResponse)!);
		expect(deleted).toEqual({ name: 'agent-cookie', cleared: true });

		const missingResponse = await ctx.sendCommand(204, [
			'cookie-get',
			'agent-cookie',
		]);
		expect(isSuccess(missingResponse)).toBe(false);
		expect(getError(missingResponse)).toContain('Cookie "agent-cookie" not found.');

		await ctx.sendCommand(205, ['cookie-set', 'temp-cookie', 'value']);
		const clearResponse = await ctx.sendCommand(206, ['cookie-clear']);
		expect(isSuccess(clearResponse)).toBe(true);
		expect('result' in clearResponse && clearResponse.result.snapshot).toBeUndefined();
		expect('result' in clearResponse && clearResponse.result.cypressCommand).toBe(
			'cy.clearCookies()',
		);

		const cleared = JSON.parse(getEvalResult(clearResponse)!);
		expect(cleared.cleared).toBeGreaterThanOrEqual(1);

		const emptyListResponse = await ctx.sendCommand(207, ['cookie-list']);
		expect(isSuccess(emptyListResponse)).toBe(true);
		expect(JSON.parse(getEvalResult(emptyListResponse)!)).toHaveLength(0);
	}, 60_000);
});
