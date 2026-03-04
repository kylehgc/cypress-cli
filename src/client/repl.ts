/**
 * Interactive REPL mode for cypress-cli.
 *
 * Provides a readline-based REPL loop that:
 * - Reads commands interactively (or from piped stdin)
 * - Sends each command to the daemon via ClientSession.sendRaw()
 * - Prints results inline
 * - Supports `exit` / `quit` / Ctrl-C to leave
 *
 * Usage: `cypress-cli repl [--session <id>] [--json]`
 */

import readline from 'node:readline';

import { ClientSession } from './session.js';
import { isErrorMessage } from '../daemon/protocol.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Options for the REPL session.
 */
export interface ReplOptions {
	/** Path to the daemon Unix socket. */
	socketPath: string;
	/** Whether to output JSON. */
	isJson: boolean;
	/** Output stream (defaults to process.stdout). */
	stdout?: { write(s: string): void };
	/** Error stream (defaults to process.stderr). */
	stderr?: { write(s: string): void };
	/** Input stream (defaults to process.stdin). */
	stdin?: NodeJS.ReadableStream;
}

// ---------------------------------------------------------------------------
// REPL
// ---------------------------------------------------------------------------

/**
 * Start an interactive REPL session.
 *
 * The REPL connects to the daemon and sends commands line by line.
 * It exits on `exit`, `quit`, empty EOF, or Ctrl-C.
 *
 * @param options - REPL configuration
 */
export async function startRepl(options: ReplOptions): Promise<void> {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	const stdin = options.stdin ?? process.stdin;

	const session = new ClientSession(options.socketPath);

	const rl = readline.createInterface({
		input: stdin,
		output: stdout as NodeJS.WritableStream,
		prompt: 'cypress> ',
		terminal: stdin === process.stdin && (stdin as NodeJS.ReadStream).isTTY === true,
	});

	stdout.write('cypress-cli REPL (type "exit" or Ctrl-C to quit)\n');
	rl.prompt();

	return new Promise<void>((resolve) => {
		// Ensure commands are processed one at a time in the order received.
		let commandQueue: Promise<void> = Promise.resolve();

		async function processLine(line: string): Promise<void> {
			const trimmed = line.trim();

			// Skip empty lines
			if (trimmed.length === 0) {
				rl.prompt();
				return;
			}

			// Exit commands
			if (trimmed === 'exit' || trimmed === 'quit') {
				rl.close();
				return;
			}

			// Parse into args array — simple split on whitespace
			// (minimist handles quoted strings, but in REPL mode we do simple split)
			const args = splitArgs(trimmed);

			try {
				const response = await session.sendRaw(args);

				if (isErrorMessage(response)) {
					if (options.isJson) {
						stderr.write(JSON.stringify({ error: response.error }) + '\n');
					} else {
						stderr.write(`Error: ${response.error}\n`);
					}
				} else {
					const result = response.result;
					if (options.isJson) {
						stdout.write(JSON.stringify(result) + '\n');
					} else {
						if (result.snapshot) {
							stdout.write(result.snapshot + '\n');
						}
						if (result.cypressCommand) {
							stdout.write(`> ${result.cypressCommand}\n`);
						}
						if (!result.snapshot && !result.cypressCommand) {
							stdout.write('OK\n');
						}
					}
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				if (options.isJson) {
					stderr.write(JSON.stringify({ error: message }) + '\n');
				} else {
					stderr.write(`Error: ${message}\n`);
				}
			}

			rl.prompt();
		}

		rl.on('line', (line: string) => {
			// Chain processing to ensure serialized command execution.
			commandQueue = commandQueue
				.then(() => processLine(line))
				.catch((err) => {
					// processLine handles all expected errors; this catch handles
					// unexpected rejections to keep the queue alive.
					const message = err instanceof Error ? err.message : String(err);
					stderr.write(`Error: ${message}\n`);
				});
		});

		rl.on('close', () => {
			stdout.write('\n');
			resolve();
		});
	});
}

/**
 * Split a command string into an args array, respecting quoted strings.
 *
 * Handles both single and double quotes. Quotes are stripped from the result.
 *
 * @param input - The raw command string
 * @returns Array of argument strings
 */
export function splitArgs(input: string): string[] {
	const args: string[] = [];
	let current = '';
	let inQuote: '"' | "'" | null = null;

	for (let i = 0; i < input.length; i++) {
		const char = input[i];

		if (inQuote) {
			if (char === inQuote) {
				inQuote = null;
			} else {
				current += char;
			}
		} else if (char === '"' || char === "'") {
			inQuote = char;
		} else if (char === ' ' || char === '\t') {
			if (current.length > 0) {
				args.push(current);
				current = '';
			}
		} else {
			current += char;
		}
	}

	if (current.length > 0) {
		args.push(current);
	}

	return args;
}
