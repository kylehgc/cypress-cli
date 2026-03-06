/**
 * E2E test: assertion commands through the full pipeline.
 *
 * Tests assert, asserturl, and asserttitle commands — both passing
 * and failing — and verifies the response indicates success or error.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
	setupE2E,
	getSnapshot,
	isSuccess,
	isError,
	type E2EContext,
} from './helpers.js';

describe('E2E: assertion', () => {
	let ctx: E2EContext;

	beforeAll(async () => {
		ctx = await setupE2E('/simple.html');
	}, 60_000);

	afterAll(async () => {
		await ctx?.teardown();
	}, 30_000);

	it('passes a valid text assertion on an element', async () => {
		// Get the snapshot to find the heading ref
		const snap = await ctx.sendCommand(50, ['snapshot']);
		const snapshot = getSnapshot(snap);
		const headingRef = findRef(snapshot, 'Welcome');
		expect(headingRef).toBeTruthy();

		// Assert the heading contains "Welcome"
		const response = await ctx.sendCommand(
			51,
			['assert', headingRef!, 'Welcome'],
			{ chainer: 'contain.text' },
		);
		expect(isSuccess(response)).toBe(true);
	}, 60_000);

	it('fails an invalid text assertion on an element', async () => {
		const snap = await ctx.sendCommand(52, ['snapshot']);
		const snapshot = getSnapshot(snap);
		const headingRef = findRef(snapshot, 'Welcome');
		expect(headingRef).toBeTruthy();

		// Assert the heading contains text that doesn't exist
		const response = await ctx.sendCommand(
			53,
			['assert', headingRef!, 'Nonexistent Text XYZ'],
			{ chainer: 'have.text' },
		);
		// This assertion should fail in Cypress → error response
		expect(isError(response)).toBe(true);
	}, 60_000);

	it('passes a valid URL assertion', async () => {
		const response = await ctx.sendCommand(
			54,
			['asserturl', '_', 'simple.html'],
			{ chainer: 'include' },
		);
		expect(isSuccess(response)).toBe(true);
	}, 60_000);

	it('fails an invalid URL assertion', async () => {
		const response = await ctx.sendCommand(
			55,
			['asserturl', '_', 'nonexistent-page-xyz.html'],
			{ chainer: 'include' },
		);
		expect(isError(response)).toBe(true);
	}, 60_000);

	it('passes a valid title assertion', async () => {
		const response = await ctx.sendCommand(
			56,
			['asserttitle', '_', 'Simple Page'],
			{ chainer: 'equal' },
		);
		expect(isSuccess(response)).toBe(true);
	}, 60_000);

	it('fails an invalid title assertion', async () => {
		const response = await ctx.sendCommand(
			57,
			['asserttitle', '_', 'Wrong Title XYZ'],
			{ chainer: 'equal' },
		);
		expect(isError(response)).toBe(true);
	}, 60_000);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find an element ref in a YAML snapshot by searching for a label or text.
 */
function findRef(snapshot: string, text: string): string | null {
	const lines = snapshot.split('\n');
	for (const line of lines) {
		if (line.includes(text)) {
			const refMatch = line.match(/\[ref=(e\d+)\]/);
			if (refMatch) {
				return refMatch[1];
			}
		}
	}
	return null;
}
