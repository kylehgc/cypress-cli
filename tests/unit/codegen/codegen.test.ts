import { describe, it, expect } from 'vitest';

import {
	generateTestFile,
	buildHistory,
} from '../../../src/codegen/codegen.js';
import { renderTestFile } from '../../../src/codegen/templateEngine.js';
import type { QueuedCommand, CommandResult } from '../../../src/daemon/commandQueue.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(
	id: number,
	action: string,
	result: Partial<CommandResult> & { cypressCommand: string },
	overrides?: Partial<QueuedCommand>,
): { command: QueuedCommand; result: CommandResult } {
	return {
		command: {
			id,
			action,
			...overrides,
		},
		result: {
			success: true,
			...result,
		},
	};
}

// ---------------------------------------------------------------------------
// templateEngine
// ---------------------------------------------------------------------------

describe('templateEngine', () => {
	describe('renderTestFile', () => {
		it('wraps commands in describe/it structure', () => {
			const output = renderTestFile(["cy.get('#btn').click()"]);
			expect(output).toContain("describe('cypress-cli generated test', () => {");
			expect(output).toContain("it('should complete the recorded flow', () => {");
			expect(output).toContain("cy.get('#btn').click();");
			expect(output).toContain('});');
		});

		it('uses custom describe name', () => {
			const output = renderTestFile([], { describeName: 'Login flow' });
			expect(output).toContain("describe('Login flow', () => {");
		});

		it('uses custom it name', () => {
			const output = renderTestFile([], { itName: 'fills and submits the form' });
			expect(output).toContain("it('fills and submits the form', () => {");
		});

		it('renders empty body for no commands', () => {
			const output = renderTestFile([]);
			expect(output).toContain("it('should complete the recorded flow', () => {");
			expect(output).toContain('});');
			// No command lines between it() and closing })
			expect(output).not.toContain('\t\tcy.');
		});

		it('preserves command order', () => {
			const commands = [
				"cy.visit('/login')",
				"cy.get('#email').type('user@test.com')",
				"cy.get('#submit').click()",
			];
			const output = renderTestFile(commands);
			const visitIndex = output.indexOf("cy.visit('/login')");
			const typeIndex = output.indexOf("cy.get('#email').type('user@test.com')");
			const clickIndex = output.indexOf("cy.get('#submit').click()");
			expect(visitIndex).toBeLessThan(typeIndex);
			expect(typeIndex).toBeLessThan(clickIndex);
		});

		it('indents commands with two tabs', () => {
			const output = renderTestFile(["cy.get('#btn').click()"]);
			expect(output).toContain("\t\tcy.get('#btn').click();");
		});

		it('escapes single quotes in describe name', () => {
			const output = renderTestFile([], { describeName: "it's a test" });
			expect(output).toContain("describe('it\\'s a test', () => {");
		});

		it('escapes single quotes in it name', () => {
			const output = renderTestFile([], { itName: "user's flow" });
			expect(output).toContain("it('user\\'s flow', () => {");
		});
	});
});

// ---------------------------------------------------------------------------
// codegen
// ---------------------------------------------------------------------------

describe('codegen', () => {
	describe('buildHistory', () => {
		it('converts session history to codegen entries', () => {
			const history = [
				makeEntry(1, 'click', {
					cypressCommand: "cy.get('#btn').click()",
					selector: '#btn',
				}),
			];
			const entries = buildHistory(history);
			expect(entries).toHaveLength(1);
			expect(entries[0].cypressCode).toBe("cy.get('#btn').click()");
			expect(entries[0].selector).toBe('#btn');
			expect(entries[0].index).toBe(0);
		});

		it('filters out snapshot commands', () => {
			const history = [
				makeEntry(1, 'click', {
					cypressCommand: "cy.get('#btn').click()",
				}),
				makeEntry(2, 'snapshot', {
					cypressCommand: '// snapshot (read-only)',
				}),
			];
			const entries = buildHistory(history);
			expect(entries).toHaveLength(1);
			expect(entries[0].command.action).toBe('click');
		});

		it('filters out history commands', () => {
			const history = [
				makeEntry(1, 'history', {
					cypressCommand: '// history',
				}),
			];
			const entries = buildHistory(history);
			expect(entries).toHaveLength(0);
		});

		it('filters out undo commands', () => {
			const history = [
				makeEntry(1, 'undo', {
					cypressCommand: '// undo',
				}),
			];
			const entries = buildHistory(history);
			expect(entries).toHaveLength(0);
		});

		it('filters out export commands', () => {
			const history = [
				makeEntry(1, 'export', {
					cypressCommand: '// export',
				}),
			];
			const entries = buildHistory(history);
			expect(entries).toHaveLength(0);
		});

		it('filters out failed commands', () => {
			const history = [
				{
					command: { id: 1, action: 'click', ref: 'e5' },
					result: {
						success: false,
						error: 'Element not found',
					} as CommandResult,
				},
			];
			const entries = buildHistory(history);
			expect(entries).toHaveLength(0);
		});

		it('filters out commands with no cypressCommand', () => {
			const history = [
				{
					command: { id: 1, action: 'click', ref: 'e5' },
					result: { success: true } as CommandResult,
				},
			];
			const entries = buildHistory(history);
			expect(entries).toHaveLength(0);
		});

		it('renumbers indices sequentially after filtering', () => {
			const history = [
				makeEntry(1, 'navigate', {
					cypressCommand: "cy.visit('/login')",
				}),
				makeEntry(2, 'snapshot', {
					cypressCommand: '// snapshot (read-only)',
				}),
				makeEntry(3, 'click', {
					cypressCommand: "cy.get('#btn').click()",
				}),
			];
			const entries = buildHistory(history);
			expect(entries).toHaveLength(2);
			expect(entries[0].index).toBe(0);
			expect(entries[1].index).toBe(1);
		});
	});

	describe('generateTestFile', () => {
		it('exports single click as valid Cypress test', () => {
			const history = [
				makeEntry(1, 'click', {
					cypressCommand: "cy.get('[data-cy=\"login\"]').click()",
					selector: '[data-cy="login"]',
				}),
			];
			const output = generateTestFile(history);
			expect(output).toContain("describe('cypress-cli generated test', () => {");
			expect(output).toContain("cy.get('[data-cy=\"login\"]').click();");
		});

		it('exports navigate + interactions as ordered test', () => {
			const history = [
				makeEntry(1, 'navigate', {
					cypressCommand: "cy.visit('/login')",
				}),
				makeEntry(2, 'type', {
					cypressCommand: "cy.get('[data-cy=\"email\"]').type('user@test.com')",
					selector: '[data-cy="email"]',
				}, { ref: 'e1', text: 'user@test.com' }),
				makeEntry(3, 'click', {
					cypressCommand: "cy.get('[data-cy=\"submit\"]').click()",
					selector: '[data-cy="submit"]',
				}, { ref: 'e3' }),
				makeEntry(4, 'assert', {
					cypressCommand: "cy.url().should('include', '/dashboard')",
				}),
			];
			const output = generateTestFile(history);
			const lines = output.split('\n');
			const commandLines = lines.filter((l) => l.trim().startsWith('cy.'));

			expect(commandLines).toHaveLength(4);
			expect(commandLines[0]).toContain("cy.visit('/login')");
			expect(commandLines[1]).toContain("cy.get('[data-cy=\"email\"]').type('user@test.com')");
			expect(commandLines[2]).toContain("cy.get('[data-cy=\"submit\"]').click()");
			expect(commandLines[3]).toContain("cy.url().should('include', '/dashboard')");
		});

		it('exports with describe/it structure', () => {
			const history = [
				makeEntry(1, 'click', {
					cypressCommand: "cy.get('#btn').click()",
				}),
			];
			const output = generateTestFile(history);
			expect(output).toContain("describe('cypress-cli generated test', () => {");
			expect(output).toContain("it('should complete the recorded flow', () => {");
		});

		it('exports assertions as .should() calls', () => {
			const history = [
				makeEntry(1, 'assert', {
					cypressCommand: "cy.get('[data-cy=\"heading\"]').should('have.text', 'Hello')",
					selector: '[data-cy="heading"]',
				}),
			];
			const output = generateTestFile(history);
			expect(output).toContain(
				"cy.get('[data-cy=\"heading\"]').should('have.text', 'Hello');",
			);
		});

		it('handles URL navigation in export starting with cy.visit', () => {
			const history = [
				makeEntry(1, 'navigate', {
					cypressCommand: "cy.visit('/login')",
				}),
				makeEntry(2, 'type', {
					cypressCommand: "cy.get('#email').type('user@test.com')",
				}, { ref: 'e1', text: 'user@test.com' }),
				makeEntry(3, 'click', {
					cypressCommand: "cy.get('#submit').click()",
				}, { ref: 'e3' }),
			];
			const output = generateTestFile(history);
			const lines = output.split('\n');
			const commandLines = lines.filter((l) => l.trim().startsWith('cy.'));
			expect(commandLines[0]).toContain("cy.visit('/login')");
		});

		it('uses custom describe name', () => {
			const history = [
				makeEntry(1, 'click', {
					cypressCommand: "cy.get('#btn').click()",
				}),
			];
			const output = generateTestFile(history, {
				describeName: 'Login Flow',
			});
			expect(output).toContain("describe('Login Flow', () => {");
		});

		it('uses custom it name', () => {
			const history = [
				makeEntry(1, 'click', {
					cypressCommand: "cy.get('#btn').click()",
				}),
			];
			const output = generateTestFile(history, {
				itName: 'completes the login process',
			});
			expect(output).toContain("it('completes the login process', () => {");
		});

		it('makes cy.visit relative when baseUrl provided', () => {
			const history = [
				makeEntry(1, 'navigate', {
					cypressCommand: "cy.visit('https://example.com/login')",
				}),
			];
			const output = generateTestFile(history, {
				baseUrl: 'https://example.com',
			});
			expect(output).toContain("cy.visit('/login');");
		});

		it('preserves cy.visit when URL does not match baseUrl', () => {
			const history = [
				makeEntry(1, 'navigate', {
					cypressCommand: "cy.visit('https://other.com/login')",
				}),
			];
			const output = generateTestFile(history, {
				baseUrl: 'https://example.com',
			});
			expect(output).toContain("cy.visit('https://other.com/login');");
		});

		it('handles empty history', () => {
			const output = generateTestFile([]);
			expect(output).toContain("describe('cypress-cli generated test', () => {");
			expect(output).toContain("it('should complete the recorded flow', () => {");
			// No command lines
			expect(output).not.toContain('\t\tcy.');
		});

		it('skips snapshot and meta-commands in output', () => {
			const history = [
				makeEntry(1, 'navigate', {
					cypressCommand: "cy.visit('/home')",
				}),
				makeEntry(2, 'snapshot', {
					cypressCommand: '// snapshot (read-only)',
				}),
				makeEntry(3, 'history', {
					cypressCommand: '// history',
				}),
				makeEntry(4, 'click', {
					cypressCommand: "cy.get('#btn').click()",
				}),
			];
			const output = generateTestFile(history);
			const lines = output.split('\n');
			const commandLines = lines.filter((l) => l.trim().startsWith('cy.'));
			expect(commandLines).toHaveLength(2);
			expect(output).not.toContain('snapshot');
			expect(output).not.toContain('history');
		});

		it('handles baseUrl with trailing slash', () => {
			const history = [
				makeEntry(1, 'navigate', {
					cypressCommand: "cy.visit('https://example.com/login')",
				}),
			];
			const output = generateTestFile(history, {
				baseUrl: 'https://example.com/',
			});
			expect(output).toContain("cy.visit('/login');");
		});
	});
});
