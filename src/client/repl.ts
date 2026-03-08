/**
 * Interactive REPL mode for cypress-cli.
 *
 * Reads commands from stdin, sends them to the daemon, and prints results.
 * Uses Node.js readline for input with line editing support.
 */

import readline from 'node:readline';

import minimist from 'minimist';

import { parseCommand } from './command.js';
import { commandRegistry } from './commands.js';
import { ClientSession, type ClientSessionOptions } from './session.js';
import { formatResult, formatError } from './cli.js';
import { runLocalCommand } from './install.js';

/**
 * Options for the REPL session.
 */
export interface ReplOptions {
	/** Session name to connect to. */
	session?: string;
	/** Output JSON instead of human-friendly text. */
	json?: boolean;
	/** Input stream (default: process.stdin). */
	input?: NodeJS.ReadableStream;
	/** Output stream (default: process.stdout). */
	output?: NodeJS.WritableStream;
	/** Override socket directory for testing. */
	socketDir?: string;
}

/**
 * Starts an interactive REPL session.
 *
 * The REPL reads commands line by line, parses them with minimist + command schemas,
 * sends them to the daemon, and prints the results. Type "exit" or "quit" to leave.
 *
 * @param options - REPL configuration
 */
export async function startRepl(options: ReplOptions = {}): Promise<void> {
	const input = options.input ?? process.stdin;
	const output = options.output ?? process.stdout;
	const asJson = options.json ?? false;

	const sessionOptions: ClientSessionOptions = {
		session: options.session,
		socketDir: options.socketDir,
	};
	const session = new ClientSession(sessionOptions);

	const rl = readline.createInterface({
		input: input as NodeJS.ReadableStream,
		output: output as NodeJS.WritableStream,
		prompt: 'cypress-cli> ',
		terminal: input === process.stdin,
	});

	const write = (text: string) => {
		output.write(text + '\n');
	};

	write(`Connected to session "${session.sessionName}". Type "help" for commands, "exit" to quit.`);
	rl.prompt();

	for await (const line of rl) {
		const trimmed = (line as string).trim();

		if (trimmed === '') {
			rl.prompt();
			continue;
		}

		if (trimmed === 'exit' || trimmed === 'quit') {
			write('Goodbye.');
			rl.close();
			return;
		}

		// Parse the line as if it were CLI arguments, respecting shell-style quoting
		const argv = splitArgv(trimmed);
		const parsed = minimist(argv, {
			boolean: ['force', 'multiple', 'headed', 'diff', 'skills'],
			string: ['browser', 'config', 'file'],
		});

		try {
			const commandArgv: Record<string, unknown> = { _: parsed._ };
			for (const [key, value] of Object.entries(parsed)) {
				if (key === '_') continue;
				commandArgv[key] = value;
			}

			const parsedCommand = parseCommand(
				commandArgv as { _: string[]; [key: string]: unknown },
				commandRegistry,
			);

			const result =
				(await runLocalCommand(parsedCommand)) ??
				(await session.sendCommand(parsedCommand));
			write(formatResult(result, asJson));
		} catch (err) {
			write(formatError(err, asJson));
		}

		rl.prompt();
	}
}

/**
 * Splits a REPL input line into an argv-style array, respecting
 * double-quoted and single-quoted strings so that e.g.
 * `type e3 "hello world"` → `['type', 'e3', 'hello world']`.
 */
export function splitArgv(line: string): string[] {
	const args: string[] = [];
	let current = '';
	let inDouble = false;
	let inSingle = false;
	let escaped = false;

	for (let i = 0; i < line.length; i++) {
		const ch = line[i];

		if (escaped) {
			current += ch;
			escaped = false;
			continue;
		}

		if (ch === '\\' && !inSingle) {
			escaped = true;
			continue;
		}

		if (ch === '"' && !inSingle) {
			inDouble = !inDouble;
			continue;
		}

		if (ch === "'" && !inDouble) {
			inSingle = !inSingle;
			continue;
		}

		if (/\s/.test(ch) && !inDouble && !inSingle) {
			if (current.length > 0) {
				args.push(current);
				current = '';
			}
			continue;
		}

		current += ch;
	}

	if (current.length > 0) {
		args.push(current);
	}

	return args;
}
