import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
	run,
	parseArgs,
	formatResult,
	formatError,
	EXIT_SUCCESS,
	EXIT_COMMAND_ERROR,
	EXIT_CONNECTION_ERROR,
	EXIT_VALIDATION_ERROR,
} from '../../../src/client/cli.js';

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe('parseArgs', () => {
	it('parses "click e5" correctly', () => {
		const result = parseArgs(['click', 'e5']);
		expect(result._).toEqual(['click', 'e5']);
	});

	it('parses "type e3 hello world" correctly', () => {
		const result = parseArgs(['type', 'e3', 'hello', 'world']);
		expect(result._).toEqual(['type', 'e3', 'hello', 'world']);
	});

	it('parses "navigate https://example.com" correctly', () => {
		const result = parseArgs(['navigate', 'https://example.com']);
		expect(result._).toEqual(['navigate', 'https://example.com']);
	});

	it('parses options with --flag syntax', () => {
		const result = parseArgs(['click', 'e5', '--force']);
		expect(result._).toEqual(['click', 'e5']);
		expect(result['force']).toBe(true);
	});

	it('parses --json flag as boolean', () => {
		const result = parseArgs(['status', '--json']);
		expect(result['json']).toBe(true);
	});

	it('parses --session flag with value', () => {
		const result = parseArgs(['click', 'e5', '--session', 'my-session']);
		expect(result['session']).toBe('my-session');
	});

	it('parses short aliases', () => {
		const result = parseArgs(['-h']);
		expect(result['help']).toBe(true);
	});

	it('parses -s as session alias', () => {
		const result = parseArgs(['click', 'e5', '-s', 'sess1']);
		expect(result['session']).toBe('sess1');
	});

	it('parses -j as json alias', () => {
		const result = parseArgs(['-j', 'status']);
		expect(result['json']).toBe(true);
	});

	it('parses "assert e5 have.text Hello" correctly', () => {
		const result = parseArgs(['assert', 'e5', 'have.text', 'Hello']);
		expect(result._).toEqual(['assert', 'e5', 'have.text', 'Hello']);
	});

	it('parses --diff as boolean', () => {
		const result = parseArgs(['snapshot', '--diff']);
		expect(result['diff']).toBe(true);
	});

	it('parses --headed as boolean', () => {
		const result = parseArgs(['open', 'http://localhost', '--headed']);
		expect(result['headed']).toBe(true);
	});

	it('parses --timeout as a number', () => {
		const result = parseArgs(['navigate', 'https://example.com', '--timeout', '1000']);
		expect(result['timeout']).toBe(1000);
		expect(typeof result['timeout']).toBe('number');
	});
});

// ---------------------------------------------------------------------------
// formatResult
// ---------------------------------------------------------------------------

describe('formatResult', () => {
	it('formats snapshot result as plain text', () => {
		const result = {
			success: true,
			snapshot: '- main:\n  - heading "Hello"',
		};
		expect(formatResult(result, false)).toBe('- main:\n  - heading "Hello"');
	});

	it('formats result as JSON when isJson is true', () => {
		const result = { success: true, snapshot: '- main' };
		const output = formatResult(result, true);
		expect(JSON.parse(output)).toEqual(result);
	});

	it('includes cypressCommand in plain text', () => {
		const result = {
			success: true,
			snapshot: '- main',
			cypressCommand: "cy.get('[data-cy=\"btn\"]').click()",
		};
		const output = formatResult(result, false);
		expect(output).toContain('- main');
		expect(output).toContain("> cy.get('[data-cy=\"btn\"]').click()");
	});

	it('returns "OK" when no snapshot or command', () => {
		const result = { success: true };
		expect(formatResult(result, false)).toBe('OK');
	});
});

// ---------------------------------------------------------------------------
// formatError
// ---------------------------------------------------------------------------

describe('formatError', () => {
	it('formats error as plain text', () => {
		expect(formatError('something broke', false)).toBe('Error: something broke');
	});

	it('formats error as JSON', () => {
		const output = formatError('something broke', true);
		expect(JSON.parse(output)).toEqual({ error: 'something broke' });
	});
});

// ---------------------------------------------------------------------------
// run (integration with mocked socket)
// ---------------------------------------------------------------------------

describe('run', () => {
	let stdout: { write: ReturnType<typeof vi.fn>; output: string };
	let stderr: { write: ReturnType<typeof vi.fn>; output: string };

	beforeEach(() => {
		stdout = {
			output: '',
			write: vi.fn((s: string) => {
				stdout.output += s;
			}),
		};
		stderr = {
			output: '',
			write: vi.fn((s: string) => {
				stderr.output += s;
			}),
		};
	});

	it('shows help when no args are provided', async () => {
		const code = await run([], { stdout, stderr });
		expect(code).toBe(EXIT_SUCCESS);
		expect(stdout.output).toContain('Usage:');
	});

	it('shows help with --help flag', async () => {
		const code = await run(['--help'], { stdout, stderr });
		expect(code).toBe(EXIT_SUCCESS);
		expect(stdout.output).toContain('Usage:');
	});

	it('shows version with --version flag', async () => {
		const code = await run(['--version'], { stdout, stderr });
		expect(code).toBe(EXIT_SUCCESS);
		expect(stdout.output).toContain('0.1.0');
	});

	it('returns validation error for unknown command', async () => {
		const code = await run(['unknowncommand'], { stdout, stderr });
		expect(code).toBe(EXIT_VALIDATION_ERROR);
		expect(stderr.output).toContain('Unknown command');
	});

	it('returns validation error for missing required args', async () => {
		const code = await run(['click'], { stdout, stderr });
		expect(code).toBe(EXIT_VALIDATION_ERROR);
		expect(stderr.output).toContain('Invalid arguments');
	});

	it('returns connection error when daemon is not running', async () => {
		const code = await run(['status'], {
			stdout,
			stderr,
			socketPath: '/tmp/cypress-cli-test-nonexistent.sock',
		});
		expect(code).toBe(EXIT_CONNECTION_ERROR);
		expect(stderr.output).toContain('Error');
	});

	it('returns validation error for too many positional args', async () => {
		const code = await run(['click', 'e5', 'extra', 'args'], { stdout, stderr });
		expect(code).toBe(EXIT_VALIDATION_ERROR);
		expect(stderr.output).toContain('Too many positional');
	});

	it('outputs JSON errors with --json flag', async () => {
		const code = await run(['unknowncommand', '--json'], { stdout, stderr });
		expect(code).toBe(EXIT_VALIDATION_ERROR);
		const parsed = JSON.parse(stderr.output.trim());
		expect(parsed).toHaveProperty('error');
	});
});

// ---------------------------------------------------------------------------
// Exit code constants
// ---------------------------------------------------------------------------

describe('exit codes', () => {
	it('has correct values', () => {
		expect(EXIT_SUCCESS).toBe(0);
		expect(EXIT_COMMAND_ERROR).toBe(1);
		expect(EXIT_CONNECTION_ERROR).toBe(2);
		expect(EXIT_VALIDATION_ERROR).toBe(3);
	});
});
