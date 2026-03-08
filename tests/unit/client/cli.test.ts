import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
	parseGlobalFlags,
	generateHelpText,
	formatResult,
	formatError,
	run,
	EXIT_SUCCESS,
	EXIT_VALIDATION_ERROR,
	type CliResult,
} from '../../../src/client/cli.js';
import type { ClientResult } from '../../../src/client/session.js';

// ---------------------------------------------------------------------------
// Mock ClientSession so `run()` never actually connects to a daemon
// ---------------------------------------------------------------------------

vi.mock('../../../src/client/session.js', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('../../../src/client/session.js')>();
	return {
		...actual,
		ClientSession: vi.fn().mockImplementation(() => ({
			sendCommand: vi.fn(),
		})),
	};
});

// ---------------------------------------------------------------------------
// parseGlobalFlags
// ---------------------------------------------------------------------------

describe('parseGlobalFlags', () => {
	it('parses --json flag', () => {
		const { flags } = parseGlobalFlags(['--json', 'click', 'e1']);
		expect(flags.json).toBe(true);
	});

	it('parses -j shorthand for --json', () => {
		const { flags } = parseGlobalFlags(['-j', 'snapshot']);
		expect(flags.json).toBe(true);
	});

	it('parses --session flag with value', () => {
		const { flags } = parseGlobalFlags([
			'--session',
			'my-session',
			'click',
			'e1',
		]);
		expect(flags.session).toBe('my-session');
	});

	it('parses -s shorthand for --session', () => {
		const { flags } = parseGlobalFlags(['-s', 'dev', 'snapshot']);
		expect(flags.session).toBe('dev');
	});

	it('parses --help flag', () => {
		const { flags } = parseGlobalFlags(['--help']);
		expect(flags.help).toBe(true);
	});

	it('parses --version flag', () => {
		const { flags } = parseGlobalFlags(['--version']);
		expect(flags.version).toBe(true);
	});

	it('parses --verbose flag', () => {
		const { flags } = parseGlobalFlags(['--verbose', 'click', 'e1']);
		expect(flags.verbose).toBe(true);
	});

	it('parses -v shorthand for --verbose', () => {
		const { flags } = parseGlobalFlags(['-v', 'snapshot']);
		expect(flags.verbose).toBe(true);
	});

	it('passes through command positionals', () => {
		const { parsed } = parseGlobalFlags(['click', 'e5', '--json']);
		expect(parsed._).toEqual(['click', 'e5']);
	});

	it('defaults to json=false, session=undefined, help=false, version=false, verbose=false', () => {
		const { flags } = parseGlobalFlags(['snapshot']);
		expect(flags.json).toBe(false);
		expect(flags.session).toBeUndefined();
		expect(flags.help).toBe(false);
		expect(flags.version).toBe(false);
		expect(flags.verbose).toBe(false);
	});

	it('passes --resume as a string option to command args', () => {
		const { parsed } = parseGlobalFlags(['open', '--resume', 'my-session']);
		expect(parsed['resume']).toBe('my-session');
		expect(parsed._).toEqual(['open']);
	});
});

// ---------------------------------------------------------------------------
// generateHelpText
// ---------------------------------------------------------------------------

describe('generateHelpText', () => {
	it('includes usage line', () => {
		const help = generateHelpText();
		expect(help).toContain('Usage: cypress-cli <command>');
	});

	it('includes all command categories', () => {
		const help = generateHelpText();
		// The command registry defines categories such as core, navigation, etc.
		expect(help).toContain('core:');
		expect(help).toContain('navigation:');
		expect(help).toContain('interaction:');
	});

	it('includes global options section', () => {
		const help = generateHelpText();
		expect(help).toContain('Global options:');
		expect(help).toContain('--json');
		expect(help).toContain('--session');
		expect(help).toContain('--verbose');
		expect(help).toContain('--help');
		expect(help).toContain('--version');
	});

	it('includes positional argument syntax for commands', () => {
		const help = generateHelpText();
		expect(help).toContain('open [url]');
		expect(help).toContain('type <ref> <text>');
		expect(help).toContain('assert <ref> <chainer> [value]');
	});
});

// ---------------------------------------------------------------------------
// formatResult
// ---------------------------------------------------------------------------

describe('formatResult', () => {
	it('returns JSON string when asJson is true', () => {
		const result: ClientResult = { success: true };
		const output = formatResult(result, true);
		expect(JSON.parse(output)).toEqual({ success: true });
	});

	it('returns snapshot text when available', () => {
		const result: ClientResult = {
			success: true,
			result: { snapshot: '- button "Submit"' },
		};
		expect(formatResult(result, false)).toBe('- button "Submit"');
	});

	it('returns "OK" for success with no extra data', () => {
		const result: ClientResult = { success: true };
		expect(formatResult(result, false)).toBe('OK');
	});

	it('returns error message for failed commands', () => {
		const result: ClientResult = {
			success: false,
			error: 'Element not found',
		};
		expect(formatResult(result, false)).toBe('Error: Element not found');
	});

	it('includes the snapshot when a failed command returns one', () => {
		const result: ClientResult = {
			success: false,
			error: 'Element not found',
			result: { snapshot: '- button "Retry"' },
		};
		const output = formatResult(result, false);
		expect(output).toContain('Error: Element not found');
		expect(output).toContain('Current snapshot:');
		expect(output).toContain('- button "Retry"');
	});

	it('returns key-value pairs for non-snapshot results', () => {
		const result: ClientResult = {
			success: true,
			result: { url: 'http://localhost:3000', title: 'Home' },
		};
		const output = formatResult(result, false);
		expect(output).toContain('url: http://localhost:3000');
		expect(output).toContain('title: Home');
	});

	it('returns raw exported test source when testFile is present', () => {
		const result: ClientResult = {
			success: true,
			result: { testFile: "describe('generated', () => {});" },
		};
		expect(formatResult(result, false)).toBe(
			"describe('generated', () => {});",
		);
	});

	it('returns the written file path when export writes to disk', () => {
		const result: ClientResult = {
			success: true,
			result: {
				testFile: "describe('generated', () => {});",
				filePath: 'generated/example.cy.ts',
			},
		};
		expect(formatResult(result, false)).toBe(
			'Wrote test file: generated/example.cy.ts',
		);
	});

	it('displays cypressCommand after snapshot', () => {
		const result: ClientResult = {
			success: true,
			result: {
				snapshot: '- button "Submit"',
				cypressCommand: "cy.get('#btn').click()",
			},
		};
		const output = formatResult(result, false);
		expect(output).toContain('- button "Submit"');
		expect(output).toContain('# Ran Cypress code:');
		expect(output).toContain("cy.get('#btn').click()");
	});

	it('displays snapshot file path', () => {
		const result: ClientResult = {
			success: true,
			result: {
				snapshot: '- heading "Title"',
				filePath: '.cypress-cli/page-2026-03-07T19-22-42-679Z.yml',
			},
		};
		const output = formatResult(result, false);
		expect(output).toContain('Snapshot saved to:');
		expect(output).toContain('.cypress-cli/page-2026-03-07T19-22-42-679Z.yml');
	});

	it('displays snapshot, cypressCommand, and filePath together', () => {
		const result: ClientResult = {
			success: true,
			result: {
				snapshot: '- button "Go"',
				cypressCommand: "cy.get('#go').click()",
				filePath: '.cypress-cli/page-2026-03-07.yml',
			},
		};
		const output = formatResult(result, false);
		const lines = output.split('\n');
		// Snapshot comes first
		expect(lines[0]).toBe('- button "Go"');
		// Then generated code comment
		expect(output).toContain("cy.get('#go').click()");
		// Then file path
		expect(output).toContain('.cypress-cli/page-2026-03-07.yml');
	});

	it('does not show cypressCommand for snapshot-only commands (no code)', () => {
		const result: ClientResult = {
			success: true,
			result: {
				snapshot: '- main',
			},
		};
		const output = formatResult(result, false);
		expect(output).toBe('- main');
		expect(output).not.toContain('Ran Cypress code');
	});
});

// ---------------------------------------------------------------------------
// formatError
// ---------------------------------------------------------------------------

describe('formatError', () => {
	it('returns JSON string when asJson is true', () => {
		const output = formatError(new Error('oops'), true);
		const parsed = JSON.parse(output);
		expect(parsed).toEqual({ success: false, error: 'oops' });
	});

	it('returns "Error: message" when asJson is false', () => {
		expect(formatError(new Error('bad input'), false)).toBe('Error: bad input');
	});

	it('handles non-Error objects', () => {
		expect(formatError('string error', false)).toBe('Error: string error');
		expect(formatError(42, false)).toBe('Error: 42');
	});
});

// ---------------------------------------------------------------------------
// run  (ClientSession is mocked — no actual daemon connection)
// ---------------------------------------------------------------------------

describe('run', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns help text with exit code 0 when no args provided', async () => {
		const result: CliResult = await run([]);
		expect(result.exitCode).toBe(EXIT_SUCCESS);
		expect(result.output).toContain('Usage: cypress-cli');
	});

	it('returns help text when --help flag is passed', async () => {
		const result: CliResult = await run(['--help']);
		expect(result.exitCode).toBe(EXIT_SUCCESS);
		expect(result.output).toContain('Usage: cypress-cli');
	});

	it('returns version when --version flag is passed', async () => {
		const result: CliResult = await run(['--version']);
		expect(result.exitCode).toBe(EXIT_SUCCESS);
		expect(result.output).toContain('cypress-cli');
		expect(result.output).toContain('0.1.0');
	});

	it('returns version even without positional args (--version takes precedence over help)', async () => {
		const result: CliResult = await run(['--version']);
		expect(result.exitCode).toBe(EXIT_SUCCESS);
		expect(result.output).not.toContain('Usage:');
	});

	it('returns exit code 3 for unknown commands', async () => {
		const result: CliResult = await run(['nonexistent']);
		expect(result.exitCode).toBe(EXIT_VALIDATION_ERROR);
		expect(result.output).toContain('Error');
	});

	it('returns exit code 3 for missing required args', async () => {
		// 'click' requires a selector argument
		const result: CliResult = await run(['click']);
		expect(result.exitCode).toBe(EXIT_VALIDATION_ERROR);
		expect(result.output).toContain('Error');
	});

	it('returns exit code 3 with JSON output for validation errors when --json passed', async () => {
		const result: CliResult = await run(['--json', 'nonexistent']);
		expect(result.exitCode).toBe(EXIT_VALIDATION_ERROR);
		const parsed = JSON.parse(result.output);
		expect(parsed.success).toBe(false);
		expect(parsed.error).toBeDefined();
	});
});
