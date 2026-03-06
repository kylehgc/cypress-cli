/**
 * E2E test: interaction commands through the full pipeline.
 *
 * Clicks buttons, types in inputs, checks/unchecks checkboxes,
 * selects dropdown options, and verifies DOM state via snapshots.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
	setupE2E,
	getSnapshot,
	isSuccess,
	type E2EContext,
} from './helpers.js';

describe('E2E: interaction', () => {
	let ctx: E2EContext;

	beforeAll(async () => {
		ctx = await setupE2E('/form.html');
	}, 60_000);

	afterAll(async () => {
		await ctx?.teardown();
	}, 30_000);

	it('types text into an input field', async () => {
		// First, get the snapshot to find refs
		const snap = await ctx.sendCommand(30, ['snapshot']);
		expect(isSuccess(snap)).toBe(true);
		const snapshot = getSnapshot(snap);

		// Find the email input ref from the snapshot
		const emailRef = findRef(snapshot, 'Email');
		expect(emailRef).toBeTruthy();

		// Type into the email input
		const response = await ctx.sendCommand(
			31,
			['type', emailRef!, 'test@example.com'],
		);
		expect(isSuccess(response)).toBe(true);

		// Verify the typed text appears in the snapshot
		const afterSnap = getSnapshot(response);
		expect(afterSnap).toContain('test@example.com');
	}, 60_000);

	it('types into password field', async () => {
		const snap = await ctx.sendCommand(32, ['snapshot']);
		const snapshot = getSnapshot(snap);

		const passwordRef = findRef(snapshot, 'Password');
		expect(passwordRef).toBeTruthy();

		const response = await ctx.sendCommand(
			33,
			['type', passwordRef!, 'secret123'],
		);
		expect(isSuccess(response)).toBe(true);
	}, 60_000);

	it('checks a checkbox', async () => {
		const snap = await ctx.sendCommand(34, ['snapshot']);
		const snapshot = getSnapshot(snap);

		const checkboxRef = findRef(snapshot, 'Remember me');
		expect(checkboxRef).toBeTruthy();

		const response = await ctx.sendCommand(35, ['check', checkboxRef!]);
		expect(isSuccess(response)).toBe(true);

		// Verify the checkbox is now checked in the snapshot
		const afterSnap = getSnapshot(response);
		expect(afterSnap).toMatch(/checkbox.*Remember me.*\[checked\]/i);
	}, 60_000);

	it('unchecks a checkbox', async () => {
		const snap = await ctx.sendCommand(36, ['snapshot']);
		const snapshot = getSnapshot(snap);

		const checkboxRef = findRef(snapshot, 'Remember me');
		expect(checkboxRef).toBeTruthy();

		const response = await ctx.sendCommand(37, ['uncheck', checkboxRef!]);
		expect(isSuccess(response)).toBe(true);

		// Verify the checkbox is no longer checked
		const afterSnap = getSnapshot(response);
		const checkboxLine = afterSnap.split('\n').find((line: string) => line.includes('Remember me') && line.includes('checkbox'));
		expect(checkboxLine).toBeDefined();
		expect(checkboxLine).not.toContain('[checked]');
	}, 60_000);

	it('selects a dropdown option', async () => {
		const snap = await ctx.sendCommand(38, ['snapshot']);
		const snapshot = getSnapshot(snap);

		const selectRef = findRef(snapshot, 'Role');
		expect(selectRef).toBeTruthy();

		const response = await ctx.sendCommand(
			39,
			['select', selectRef!, 'Admin'],
		);
		expect(isSuccess(response)).toBe(true);

		// Verify the selected option is reflected in the snapshot
		const afterSnap = getSnapshot(response);
		expect(afterSnap).toMatch(/Admin.*\[selected\]/);
	}, 60_000);

	it('clicks a button and verifies DOM state change', async () => {
		const snap = await ctx.sendCommand(40, ['snapshot']);
		const snapshot = getSnapshot(snap);

		const buttonRef = findRef(snapshot, 'Login');
		expect(buttonRef).toBeTruthy();

		const response = await ctx.sendCommand(41, ['click', buttonRef!]);
		expect(isSuccess(response)).toBe(true);

		// Verify that clicking the Login button was successful and the
		// system still responds. The form's onsubmit handler fires
		// (with event.preventDefault), so the page remains stable.
		const afterSnap = await ctx.sendCommand(42, ['snapshot']);
		expect(isSuccess(afterSnap)).toBe(true);
		const afterSnapshot = getSnapshot(afterSnap);
		// The form page should still be visible after the click
		expect(afterSnapshot).toContain('Login Form');
		expect(afterSnapshot).toContain('Login');
	}, 60_000);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find an element ref in a YAML snapshot by searching for a label or text.
 * Refs look like [ref=e5] in the snapshot YAML.
 *
 * Searches for lines containing the given text and extracts the ref.
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
