/**
 * E2E test: error recovery through the full pipeline.
 *
 * Tests invalid selectors, unknown commands, and missing arguments
 * to verify the system returns graceful error responses instead of crashing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
	setupE2E,
	isError,
	isSuccess,
	getError,
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
		expect(error).toContain('requires');
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
