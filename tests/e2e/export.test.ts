/**
 * E2E test: export (codegen) through the full pipeline.
 *
 * Runs a sequence of commands, exports them to a test file via the
 * daemon's export command, and verifies the generated code structure.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { setupE2E, isSuccess, type E2EContext } from './helpers.js';
import type { ResponseMessage } from '../../src/daemon/protocol.js';

describe('E2E: export', () => {
	let ctx: E2EContext;

	beforeAll(async () => {
		ctx = await setupE2E('/simple.html');
	}, 60_000);

	afterAll(async () => {
		await ctx?.teardown();
	}, 30_000);

	it('executes commands and exports a valid test file', async () => {
		// Execute a navigate command (generates a cypressCommand for codegen)
		const navResponse = await ctx.sendCommand(60, [
			'navigate',
			'_',
			`http://127.0.0.1:${ctx.port}/simple.html`,
		]);
		expect(isSuccess(navResponse)).toBe(true);

		// Take a snapshot (no-op command but needed for flow)
		const snapResponse = await ctx.sendCommand(61, ['snapshot']);
		expect(isSuccess(snapResponse)).toBe(true);

		// Export the command history as a test file
		const exportResponse = await ctx.sendCommand(62, ['export']);
		expect(isSuccess(exportResponse)).toBe(true);

		const result = (exportResponse as ResponseMessage).result;
		const testFile = result.testFile;
		expect(testFile).toBeDefined();
		expect(typeof testFile).toBe('string');

		// The generated test file should contain describe/it blocks
		expect(testFile).toContain('describe(');
		expect(testFile).toContain('it(');

		// It should contain the navigate command as cy.visit()
		expect(testFile).toContain('cy.visit(');
	}, 60_000);

	it('export with custom describe and it names', async () => {
		const exportResponse = await ctx.sendCommand(63, ['export'], {
			describe: 'My Test Suite',
			it: 'should work',
		});
		expect(isSuccess(exportResponse)).toBe(true);

		const result = (exportResponse as ResponseMessage).result;
		const testFile = result.testFile;
		expect(testFile).toBeDefined();

		expect(testFile).toContain('My Test Suite');
		expect(testFile).toContain('should work');
	}, 60_000);

	it('includes ref-based commands in exported code', async () => {
		const snapshotResponse = await ctx.sendCommand(65, ['snapshot']);
		expect(isSuccess(snapshotResponse)).toBe(true);

		const snapshot =
			(snapshotResponse as ResponseMessage).result.snapshot ?? '';
		const helloRef = snapshot.match(/button "Say Hello" \[ref=(e\d+)\]/)?.[1];
		expect(helloRef).toBeDefined();

		const clickResponse = await ctx.sendCommand(66, ['click', helloRef!]);
		expect(isSuccess(clickResponse)).toBe(true);

		const exportResponse = await ctx.sendCommand(67, ['export']);
		expect(isSuccess(exportResponse)).toBe(true);

		const result = (exportResponse as ResponseMessage).result;
		const testFile = result.testFile ?? '';
		expect(testFile).toContain("cy.get('#btn-hello').click()");
	}, 60_000);

	it('history command returns executed commands', async () => {
		const historyResponse = await ctx.sendCommand(64, ['history']);
		expect(isSuccess(historyResponse)).toBe(true);

		const result = (historyResponse as ResponseMessage).result;
		// History is returned as a JSON string in the historyEntries field
		expect(result.historyEntries).toBeDefined();

		const history = JSON.parse(result.historyEntries!);
		expect(Array.isArray(history)).toBe(true);
		expect(history.length).toBeGreaterThan(0);

		// First entry should be a navigate command
		const navigateEntry = history.find(
			(e: { action: string }) => e.action === 'navigate',
		);
		expect(navigateEntry).toBeDefined();
	}, 60_000);
});
