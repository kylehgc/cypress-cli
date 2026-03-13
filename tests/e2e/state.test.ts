/**
 * E2E test: state-save and state-load commands.
 *
 * Tests the `state-save` and `state-load` commands through the full
 * CLI → Daemon → Cypress → Browser pipeline.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
	setupE2E,
	isSuccess,
	getEvalResult,
	getError,
	type E2EContext,
} from './helpers.js';

describe('E2E: state-save and state-load', () => {
	let ctx: E2EContext;

	beforeAll(async () => {
		ctx = await setupE2E('/simple.html');
	}, 60_000);

	afterAll(async () => {
		await ctx?.teardown();
	}, 30_000);

	it('saves and loads browser state (cookies, localStorage, sessionStorage)', async () => {
		// Set a cookie
		const setResponse = await ctx.sendCommand(300, [
			'cookie-set',
			'test-cookie',
			'cookie-value',
		]);
		expect(isSuccess(setResponse)).toBe(true);

		// Set localStorage and sessionStorage via run-code
		const storageResponse = await ctx.sendCommand(301, [
			'run-code',
			'window.localStorage.setItem("ls-key", "ls-value"); window.sessionStorage.setItem("ss-key", "ss-value"); "done"',
		]);
		expect(isSuccess(storageResponse)).toBe(true);

		// Save state
		const saveResponse = await ctx.sendCommand(302, ['state-save']);
		expect(isSuccess(saveResponse)).toBe(true);
		expect(
			'result' in saveResponse && saveResponse.result.snapshot,
		).toBeUndefined();

		const saveResult = JSON.parse(getEvalResult(saveResponse)!);
		expect(saveResult.url).toBeDefined();
		expect(Array.isArray(saveResult.cookies)).toBe(true);
		expect(
			saveResult.cookies.some(
				(c: { name: string }) => c.name === 'test-cookie',
			),
		).toBe(true);
		expect(Array.isArray(saveResult.localStorage)).toBe(true);
		expect(
			saveResult.localStorage.some(
				([k]: [string, string]) => k === 'ls-key',
			),
		).toBe(true);
		expect(Array.isArray(saveResult.sessionStorage)).toBe(true);
		expect(
			saveResult.sessionStorage.some(
				([k]: [string, string]) => k === 'ss-key',
			),
		).toBe(true);

		// Verify file was written
		expect(
			'result' in saveResponse && saveResponse.result.filePath,
		).toBeDefined();
		const filePath =
			'result' in saveResponse
				? (saveResponse.result as Record<string, unknown>).filePath
				: undefined;
		expect(typeof filePath).toBe('string');

		// Clear cookies and storage
		await ctx.sendCommand(303, ['cookie-clear']);
		await ctx.sendCommand(304, [
			'run-code',
			'window.localStorage.clear(); window.sessionStorage.clear(); "cleared"',
		]);

		// Load state back from file
		const loadResponse = await ctx.sendCommand(305, [
			'state-load',
			filePath as string,
		]);
		expect(isSuccess(loadResponse)).toBe(true);

		const loadResult = JSON.parse(getEvalResult(loadResponse)!);
		expect(loadResult.cookies).toBeGreaterThanOrEqual(1);
		expect(loadResult.localStorage).toBeGreaterThanOrEqual(1);
		expect(loadResult.sessionStorage).toBeGreaterThanOrEqual(1);

		// Verify cookie was restored
		const cookieResponse = await ctx.sendCommand(306, [
			'cookie-get',
			'test-cookie',
		]);
		expect(isSuccess(cookieResponse)).toBe(true);
		const cookie = JSON.parse(getEvalResult(cookieResponse)!);
		expect(cookie.value).toBe('cookie-value');

		// Verify localStorage was restored
		const lsResponse = await ctx.sendCommand(307, [
			'run-code',
			'window.localStorage.getItem("ls-key")',
		]);
		expect(isSuccess(lsResponse)).toBe(true);
		expect(getEvalResult(lsResponse)).toBe('ls-value');

		// Verify sessionStorage was restored
		const ssResponse = await ctx.sendCommand(308, [
			'run-code',
			'window.sessionStorage.getItem("ss-key")',
		]);
		expect(isSuccess(ssResponse)).toBe(true);
		expect(getEvalResult(ssResponse)).toBe('ss-value');

		// Clean up state file
		if (typeof filePath === 'string') {
			await fs.unlink(path.resolve(filePath)).catch(() => {
				/* best effort */
			});
		}
	}, 60_000);

	it('state-load fails for missing file', async () => {
		const response = await ctx.sendCommand(310, [
			'state-load',
			'nonexistent-file.json',
		]);
		expect(isSuccess(response)).toBe(false);
		expect(getError(response)).toContain('not found');
	}, 30_000);

	it('saves state with custom filename', async () => {
		const saveResponse = await ctx.sendCommand(311, ['state-save'], {
			filename: 'custom-state.json',
		});
		expect(isSuccess(saveResponse)).toBe(true);
		const filePath =
			'result' in saveResponse
				? (saveResponse.result as Record<string, unknown>).filePath
				: undefined;
		expect(typeof filePath).toBe('string');
		expect(String(filePath)).toContain('custom-state.json');

		// Clean up
		if (typeof filePath === 'string') {
			await fs.unlink(path.resolve(filePath)).catch(() => {
				/* best effort */
			});
		}
	}, 60_000);
});
