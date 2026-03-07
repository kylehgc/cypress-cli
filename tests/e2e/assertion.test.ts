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

describe('E2E: element assertions on form', () => {
	let ctx: E2EContext;

	beforeAll(async () => {
		ctx = await setupE2E('/form.html');
	}, 60_000);

	afterAll(async () => {
		await ctx?.teardown();
	}, 30_000);

	it('asserts have.value after typing into an input', async () => {
		const snap = await ctx.sendCommand(100, ['snapshot']);
		const snapshot = getSnapshot(snap);
		const emailRef = findRef(snapshot, 'Email');
		expect(emailRef).toBeTruthy();

		// Type into the email field
		await ctx.sendCommand(101, ['type', emailRef!, 'hello@example.com']);

		// Assert the input has the typed value
		const response = await ctx.sendCommand(
			102,
			['assert', emailRef!, 'hello@example.com'],
			{ chainer: 'have.value' },
		);
		expect(isSuccess(response)).toBe(true);
	}, 60_000);

	it('fails have.value with wrong expected value', async () => {
		const snap = await ctx.sendCommand(103, ['snapshot']);
		const snapshot = getSnapshot(snap);
		const emailRef = findRef(snapshot, 'Email');
		expect(emailRef).toBeTruthy();

		const response = await ctx.sendCommand(
			104,
			['assert', emailRef!, 'wrong@value.com'],
			{ chainer: 'have.value' },
		);
		expect(isError(response)).toBe(true);
	}, 60_000);

	it('asserts be.visible on a visible element', async () => {
		const snap = await ctx.sendCommand(105, ['snapshot']);
		const snapshot = getSnapshot(snap);
		const btnRef = findRef(snapshot, 'Login');
		expect(btnRef).toBeTruthy();

		const response = await ctx.sendCommand(
			106,
			['assert', btnRef!],
			{ chainer: 'be.visible' },
		);
		expect(isSuccess(response)).toBe(true);
	}, 60_000);

	it('asserts be.checked after checking a checkbox', async () => {
		const snap = await ctx.sendCommand(107, ['snapshot']);
		const snapshot = getSnapshot(snap);
		const checkRef = findRef(snapshot, 'Remember');
		expect(checkRef).toBeTruthy();

		// Check the checkbox
		await ctx.sendCommand(108, ['check', checkRef!]);

		// Assert it is checked
		const response = await ctx.sendCommand(
			109,
			['assert', checkRef!],
			{ chainer: 'be.checked' },
		);
		expect(isSuccess(response)).toBe(true);
	}, 60_000);

	it('asserts not.be.checked on an unchecked checkbox', async () => {
		const snap = await ctx.sendCommand(110, ['snapshot']);
		const snapshot = getSnapshot(snap);
		const checkRef = findRef(snapshot, 'Remember');
		expect(checkRef).toBeTruthy();

		// Uncheck the checkbox first
		await ctx.sendCommand(111, ['uncheck', checkRef!]);

		const response = await ctx.sendCommand(
			112,
			['assert', checkRef!],
			{ chainer: 'not.be.checked' },
		);
		expect(isSuccess(response)).toBe(true);
	}, 60_000);

	it('asserts be.enabled on an enabled button', async () => {
		const snap = await ctx.sendCommand(113, ['snapshot']);
		const snapshot = getSnapshot(snap);
		const btnRef = findRef(snapshot, 'Login');
		expect(btnRef).toBeTruthy();

		const response = await ctx.sendCommand(
			114,
			['assert', btnRef!],
			{ chainer: 'be.enabled' },
		);
		expect(isSuccess(response)).toBe(true);
	}, 60_000);

	it('asserts have.attr for existing attribute', async () => {
		const snap = await ctx.sendCommand(115, ['snapshot']);
		const snapshot = getSnapshot(snap);
		const emailRef = findRef(snapshot, 'Email');
		expect(emailRef).toBeTruthy();

		const response = await ctx.sendCommand(
			116,
			['assert', emailRef!, 'name'],
			{ chainer: 'have.attr' },
		);
		expect(isSuccess(response)).toBe(true);
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
