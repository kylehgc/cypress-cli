/**
 * CLI entry point: parses arguments with minimist, validates with zod,
 * and dispatches the command to the daemon over a Unix domain socket.
 *
 * Exit codes:
 *   0 — success
 *   1 — command error (daemon returned an error)
 *   2 — connection error (daemon not reachable)
 *   3 — validation error (bad args / unknown command)
 */

import minimist from 'minimist';
import { z } from 'zod';

import { parseCommand, CommandValidationError } from './command.js';
import { commandRegistry, allCommands } from './commands.js';
import { ClientSession } from './session.js';
import { startRepl } from './repl.js';

// ---------------------------------------------------------------------------
// Exit codes
// ---------------------------------------------------------------------------

/** Command completed successfully. */
export const EXIT_SUCCESS = 0;
/** Daemon returned an error for the command. */
export const EXIT_COMMAND_ERROR = 1;
/** Could not connect to the daemon. */
export const EXIT_CONNECTION_ERROR = 2;
/** CLI argument validation failed. */
export const EXIT_VALIDATION_ERROR = 3;

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

/**
 * Parse raw process.argv into a minimist result.
 *
 * @param argv - Raw argument array (typically process.argv.slice(2))
 * @returns Minimist-parsed arguments
 */
export function parseArgs(argv: string[]): minimist.ParsedArgs {
	return minimist(argv, {
		boolean: ['json', 'help', 'version', 'force', 'multiple', 'headed', 'diff'],
		string: ['session', 'file', 'browser', 'config'],
		alias: {
			h: 'help',
			v: 'version',
			s: 'session',
			j: 'json',
		},
	});
}

// ---------------------------------------------------------------------------
// Help / version
// ---------------------------------------------------------------------------

function buildHelpText(): string {
	const lines: string[] = [
		'Usage: cypress-cli <command> [args] [options]',
		'',
		'Commands:',
	];

	for (const cmd of allCommands) {
		const entry = commandRegistry.get(cmd.name);
		const positionals = entry?.positionals ?? [];
		const argStr = positionals.map((p) => {
			// Detect optionality from zod schema: optional fields show as [arg], required as <arg>
			let isOptional = false;
			if (entry && entry.schema.args instanceof z.ZodObject) {
				const field = entry.schema.args.shape[p];
				isOptional = field?.isOptional() ?? false;
			}
			return isOptional ? `[${p}]` : `<${p}>`;
		}).join(' ');
		const usage = argStr ? `${cmd.name} ${argStr}` : cmd.name;
		lines.push(`  ${usage.padEnd(36)}${cmd.description}`);
	}

	lines.push(
		'',
		'Options:',
		'  --json                              Output machine-readable JSON',
		'  --session <id>                      Target a specific session',
		'  --help, -h                          Show this help',
		'  --version, -v                       Show version',
		'',
		'Exit codes:',
		'  0  Success',
		'  1  Command error',
		'  2  Connection error',
		'  3  Validation error',
	);

	return lines.join('\n') + '\n';
}

const HELP_TEXT = buildHelpText();

const VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

/**
 * Format a successful command result for terminal output.
 *
 * @param result - The daemon response result
 * @param isJson - Whether to output JSON
 * @returns Formatted string
 */
export function formatResult(
	result: { success: boolean; snapshot?: string; selector?: string; cypressCommand?: string },
	isJson: boolean,
): string {
	if (isJson) {
		return JSON.stringify(result);
	}

	const parts: string[] = [];

	if (result.snapshot) {
		parts.push(result.snapshot);
	}

	if (result.cypressCommand) {
		parts.push(`> ${result.cypressCommand}`);
	}

	if (parts.length === 0) {
		parts.push('OK');
	}

	return parts.join('\n');
}

/**
 * Format an error for terminal output.
 *
 * @param error - Error message string
 * @param isJson - Whether to output JSON
 * @returns Formatted string
 */
export function formatError(error: string, isJson: boolean): string {
	if (isJson) {
		return JSON.stringify({ error });
	}
	return `Error: ${error}`;
}

// ---------------------------------------------------------------------------
// Main CLI runner
// ---------------------------------------------------------------------------

/**
 * Run the CLI with the given arguments.
 *
 * @param argv - Raw argument array (typically process.argv.slice(2))
 * @param options - Overrides for testing (socketPath, output streams)
 * @returns Exit code
 */
export async function run(
	argv: string[],
	options: {
		socketPath?: string;
		stdout?: { write(s: string): void };
		stderr?: { write(s: string): void };
	} = {},
): Promise<number> {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;

	// Parse CLI arguments
	const parsed = parseArgs(argv);
	const isJson = Boolean(parsed['json']);
	const sessionId = (parsed['session'] as string | undefined) ?? 'default';

	// Handle --version
	if (parsed['version']) {
		stdout.write(VERSION + '\n');
		return EXIT_SUCCESS;
	}

	// Handle --help
	if (parsed['help'] || parsed._.length === 0) {
		stdout.write(HELP_TEXT);
		return EXIT_SUCCESS;
	}

	// Handle REPL mode
	const commandName = parsed._[0];
	if (commandName === 'repl') {
		const socketPath = options.socketPath ?? ClientSession.defaultSocketPath(sessionId);
		try {
			await startRepl({ socketPath, isJson, stdout, stderr });
			return EXIT_SUCCESS;
		} catch (err) {
			stderr.write(formatError(
				err instanceof Error ? err.message : String(err),
				isJson,
			) + '\n');
			return EXIT_CONNECTION_ERROR;
		}
	}

	// Validate command against registry
	let parsedCommand;
	try {
		parsedCommand = parseCommand(parsed, commandRegistry);
	} catch (err) {
		if (err instanceof CommandValidationError) {
			stderr.write(formatError(err.message, isJson) + '\n');
			return EXIT_VALIDATION_ERROR;
		}
		throw err;
	}

	// Connect to daemon and send command
	const socketPath = options.socketPath ?? ClientSession.defaultSocketPath(sessionId);
	const session = new ClientSession(socketPath);

	try {
		const response = await session.sendCommand(parsedCommand, parsed);
		if ('error' in response) {
			stderr.write(formatError(response.error as string, isJson) + '\n');
			return EXIT_COMMAND_ERROR;
		}
		const result = (response as { result: { success: boolean; snapshot?: string; selector?: string; cypressCommand?: string } }).result;
		stdout.write(formatResult(result, isJson) + '\n');
		return EXIT_SUCCESS;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		stderr.write(formatError(message, isJson) + '\n');
		return EXIT_CONNECTION_ERROR;
	}
}
