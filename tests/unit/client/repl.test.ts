import { describe, it, expect, vi, beforeEach } from 'vitest';

import { splitArgv, startRepl } from '../../../src/client/repl.js';

const { mockRunLocalCommand } = vi.hoisted(() => ({
	mockRunLocalCommand: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock ClientSession so startRepl() never actually connects to a daemon
// ---------------------------------------------------------------------------

const mockSendCommand = vi.fn();
const mockSessionName = 'test-session';

vi.mock('../../../src/client/session.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../../src/client/session.js')>();
	return {
		...actual,
		ClientSession: vi.fn().mockImplementation(() => ({
			sendCommand: mockSendCommand,
			get sessionName() {
				return mockSessionName;
			},
		})),
	};
});

vi.mock('../../../src/client/install.js', () => ({
	runLocalCommand: mockRunLocalCommand,
}));

// ---------------------------------------------------------------------------
// Mock readline so we can control what lines the REPL receives
// ---------------------------------------------------------------------------

const mockPrompt = vi.fn();
const mockClose = vi.fn();
let mockLines: string[] = [];

vi.mock('node:readline', () => ({
	default: {
		createInterface: vi.fn(() => ({
			prompt: mockPrompt,
			close: mockClose,
			[Symbol.asyncIterator]() {
				let index = 0;
				const lines = mockLines;
				return {
					next() {
						if (index < lines.length) {
							return Promise.resolve({ value: lines[index++], done: false });
						}
						return Promise.resolve({ value: undefined, done: true });
					},
				};
			},
		})),
	},
}));

// ---------------------------------------------------------------------------
// splitArgv
// ---------------------------------------------------------------------------

describe('splitArgv', () => {
	it('splits simple whitespace-delimited tokens', () => {
		expect(splitArgv('click e1')).toEqual(['click', 'e1']);
	});

	it('returns an empty array for empty input', () => {
		expect(splitArgv('')).toEqual([]);
	});

	it('returns an empty array for whitespace-only input', () => {
		expect(splitArgv('   ')).toEqual([]);
	});

	it('trims leading and trailing whitespace', () => {
		expect(splitArgv('  snapshot  ')).toEqual(['snapshot']);
	});

	it('handles multiple spaces between tokens', () => {
		expect(splitArgv('click   e3   --force')).toEqual(['click', 'e3', '--force']);
	});

	it('respects double-quoted strings with spaces', () => {
		expect(splitArgv('type e3 "hello world"')).toEqual(['type', 'e3', 'hello world']);
	});

	it('respects single-quoted strings with spaces', () => {
		expect(splitArgv("type e3 'hello world'")).toEqual(['type', 'e3', 'hello world']);
	});

	it('drops empty double-quoted strings', () => {
		// The implementation only pushes tokens when current.length > 0,
		// so empty quoted strings are silently dropped.
		expect(splitArgv('type e1 ""')).toEqual(['type', 'e1']);
	});

	it('drops empty single-quoted strings', () => {
		expect(splitArgv("type e1 ''")).toEqual(['type', 'e1']);
	});

	it('handles backslash escape for spaces outside quotes', () => {
		expect(splitArgv('type e1 hello\\ world')).toEqual(['type', 'e1', 'hello world']);
	});

	it('handles backslash escape for double quote', () => {
		expect(splitArgv('type e1 "say \\"hi\\""')).toEqual(['type', 'e1', 'say "hi"']);
	});

	it('does not interpret backslash escapes inside single quotes', () => {
		expect(splitArgv("type e1 'no\\\\escape'")).toEqual(['type', 'e1', 'no\\\\escape']);
	});

	it('handles mixed quoting styles', () => {
		expect(splitArgv(`type e1 "double quoted" 'single quoted'`)).toEqual([
			'type',
			'e1',
			'double quoted',
			'single quoted',
		]);
	});

	it('handles adjacent quoted and unquoted segments', () => {
		expect(splitArgv('type e1 hello"world"')).toEqual(['type', 'e1', 'helloworld']);
	});

	it('handles a single token', () => {
		expect(splitArgv('snapshot')).toEqual(['snapshot']);
	});

	it('handles tab characters as whitespace', () => {
		expect(splitArgv("click\te1")).toEqual(['click', 'e1']);
	});

	it('handles backslash at end of unquoted input', () => {
		// Trailing backslash with nothing to escape — the escaped flag stays true
		// and the loop ends without appending, so the backslash is silently dropped.
		expect(splitArgv('click e1\\')).toEqual(['click', 'e1']);
	});

	it('preserves special characters inside quotes', () => {
		expect(splitArgv('type e1 "hello\tworld"')).toEqual(['type', 'e1', 'hello\tworld']);
	});
});

// ---------------------------------------------------------------------------
// startRepl
// ---------------------------------------------------------------------------

describe('startRepl', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockLines = [];
		mockRunLocalCommand.mockResolvedValue(null);
	});

	/** Helper: creates fake input/output streams and captures output chunks. */
	function createStreams() {
		const outputChunks: string[] = [];
		const fakeOutput: NodeJS.WritableStream = {
			write: vi.fn((chunk: string) => {
				outputChunks.push(chunk);
				return true;
			}),
		} as unknown as NodeJS.WritableStream;
		const fakeInput = {} as unknown as NodeJS.ReadableStream;
		return { outputChunks, fakeOutput, fakeInput };
	}

	it('prints welcome message and exits on "exit"', async () => {
		mockLines = ['exit'];
		const { outputChunks, fakeOutput, fakeInput } = createStreams();

		await startRepl({ input: fakeInput, output: fakeOutput });

		expect(outputChunks.some((c) => c.includes('Connected to session'))).toBe(true);
		expect(outputChunks.some((c) => c.includes('Goodbye.'))).toBe(true);
		expect(mockClose).toHaveBeenCalledOnce();
	});

	it('exits on "quit" command', async () => {
		mockLines = ['quit'];
		const { outputChunks, fakeOutput, fakeInput } = createStreams();

		await startRepl({ input: fakeInput, output: fakeOutput });

		expect(outputChunks.some((c) => c.includes('Goodbye.'))).toBe(true);
		expect(mockClose).toHaveBeenCalledOnce();
	});

	it('skips empty lines and re-prompts', async () => {
		mockLines = ['', '  ', 'exit'];
		const { fakeOutput, fakeInput } = createStreams();

		await startRepl({ input: fakeInput, output: fakeOutput });

		// prompt() is called: once at start + once per empty line (2) = 3
		expect(mockPrompt).toHaveBeenCalledTimes(3);
	});

	it('sends parsed command to session and writes result', async () => {
		mockSendCommand.mockResolvedValueOnce({ success: true });
		mockLines = ['snapshot', 'exit'];
		const { outputChunks, fakeOutput, fakeInput } = createStreams();

		await startRepl({ input: fakeInput, output: fakeOutput });

		expect(mockSendCommand).toHaveBeenCalledOnce();
		expect(outputChunks.some((c) => c.includes('OK'))).toBe(true);
	});

	it('runs install --skills locally without sending it to the daemon', async () => {
		mockRunLocalCommand.mockResolvedValueOnce({
			success: true,
			result: {
				installedPath: '.github/skills/cypress-cli',
			},
		});
		mockLines = ['install --skills', 'exit'];
		const { outputChunks, fakeOutput, fakeInput } = createStreams();

		await startRepl({ input: fakeInput, output: fakeOutput });

		expect(mockRunLocalCommand).toHaveBeenCalledWith({
			command: 'install',
			args: {},
			options: { skills: true },
		});
		expect(mockSendCommand).not.toHaveBeenCalled();
		expect(
			outputChunks.some((c) =>
				c.includes('Installed skills to: .github/skills/cypress-cli'),
			),
		).toBe(true);
	});

	it('writes formatted error when command throws', async () => {
		mockSendCommand.mockRejectedValueOnce(new Error('connection lost'));
		mockLines = ['snapshot', 'exit'];
		const { outputChunks, fakeOutput, fakeInput } = createStreams();

		await startRepl({ input: fakeInput, output: fakeOutput });

		expect(outputChunks.some((c) => c.includes('Error'))).toBe(true);
		expect(outputChunks.some((c) => c.includes('connection lost'))).toBe(true);
	});

	it('writes validation error for unknown commands', async () => {
		mockLines = ['nonexistent', 'exit'];
		const { outputChunks, fakeOutput, fakeInput } = createStreams();

		await startRepl({ input: fakeInput, output: fakeOutput });

		// parseCommand throws for unknown commands; the REPL catches and formats
		expect(outputChunks.some((c) => c.includes('Error'))).toBe(true);
		// prompt is still called after the error (at least start + after error)
		expect(mockPrompt.mock.calls.length).toBeGreaterThanOrEqual(2);
	});

	it('prompts again after each successful command', async () => {
		mockSendCommand.mockResolvedValueOnce({ success: true });
		mockLines = ['snapshot', 'exit'];
		const { fakeOutput, fakeInput } = createStreams();

		await startRepl({ input: fakeInput, output: fakeOutput });

		// Initial prompt + prompt after command result = 2
		expect(mockPrompt).toHaveBeenCalledTimes(2);
	});
});
