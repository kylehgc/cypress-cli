/**
 * CLI entry point: parses arguments, validates commands, dispatches to daemon.
 *
 * Exit codes:
 *   0 — success
 *   1 — command execution error (daemon reported failure)
 *   2 — connection error (daemon not running, socket not found)
 *   3 — validation error (unknown command, missing args, bad flags)
 */

import minimist from 'minimist';

import { parseCommand, CommandValidationError } from './command.js';
import { commandRegistry, allCommands } from './commands.js';
import { ClientSession, type ClientResult } from './session.js';
import { ClientConnectionError } from './socketConnection.js';

/** Exit code for success. */
export const EXIT_SUCCESS = 0;

/** Exit code for command execution error. */
export const EXIT_COMMAND_ERROR = 1;

/** Exit code for connection error. */
export const EXIT_CONNECTION_ERROR = 2;

/** Exit code for validation error. */
export const EXIT_VALIDATION_ERROR = 3;

/**
 * Options parsed from global CLI flags (not command-specific).
 */
export interface GlobalFlags {
	/** Output machine-readable JSON instead of human-friendly text. */
	json: boolean;
	/** Target a specific session by name. */
	session: string | undefined;
	/** Show help text. */
	help: boolean;
	/** Show version. */
	version: boolean;
}

/**
 * Result of running the CLI. Used for testing without process.exit.
 */
export interface CliResult {
	exitCode: number;
	output: string;
}

/**
 * Parses global flags from argv, separating them from command-specific args.
 *
 * @param argv - Raw process.argv (typically process.argv.slice(2))
 * @returns Parsed global flags and the minimist-parsed args object
 */
export function parseGlobalFlags(argv: string[]): {
	flags: GlobalFlags;
	parsed: ReturnType<typeof minimist>;
} {
	const parsed = minimist(argv, {
		boolean: ['json', 'help', 'version', 'force', 'multiple', 'headed', 'diff'],
		string: ['session', 'browser', 'config', 'file'],
		alias: {
			s: 'session',
			h: 'help',
			v: 'version',
			j: 'json',
		},
		'--': false,
		unknown: () => true,
	});

	const flags: GlobalFlags = {
		json: parsed['json'] === true,
		session: typeof parsed['session'] === 'string' ? parsed['session'] : undefined,
		help: parsed['help'] === true,
		version: parsed['version'] === true,
	};

	return { flags, parsed };
}

/**
 * Generates help text listing all available commands.
 */
export function generateHelpText(): string {
	const lines: string[] = [
		'Usage: cypress-cli <command> [args] [options]',
		'',
		'Commands:',
	];

	const categories = new Map<string, Array<{ name: string; description: string }>>();
	for (const cmd of allCommands) {
		const list = categories.get(cmd.category) ?? [];
		list.push({ name: cmd.name, description: cmd.description });
		categories.set(cmd.category, list);
	}

	for (const [category, cmds] of categories) {
		lines.push(`  ${category}:`);
		for (const cmd of cmds) {
			lines.push(`    ${cmd.name.padEnd(14)} ${cmd.description}`);
		}
		lines.push('');
	}

	lines.push('Global options:');
	lines.push('  --json, -j       Output machine-readable JSON');
	lines.push('  --session, -s    Target a specific session by name');
	lines.push('  --help, -h       Show this help text');
	lines.push('  --version, -v    Show version');

	return lines.join('\n');
}

/**
 * Formats a command result for terminal output.
 *
 * @param result - The command result from the daemon
 * @param asJson - Whether to format as JSON
 * @returns Formatted string for output
 */
export function formatResult(result: ClientResult, asJson: boolean): string {
	if (asJson) {
		return JSON.stringify(result, null, 2);
	}

	if (!result.success) {
		return `Error: ${result.error ?? 'Unknown error'}`;
	}

	// If there's a snapshot, show it prominently
	const resultObj = result.result as Record<string, unknown> | undefined;
	if (resultObj?.snapshot) {
		return String(resultObj.snapshot);
	}

	// For non-snapshot results, show as key-value pairs
	if (resultObj) {
		const { success: _success, ...rest } = resultObj;
		if (Object.keys(rest).length > 0) {
			return Object.entries(rest)
				.map(([key, value]) => `${key}: ${String(value)}`)
				.join('\n');
		}
	}

	return 'OK';
}

/**
 * Formats an error for terminal output.
 */
export function formatError(error: unknown, asJson: boolean): string {
	const message = error instanceof Error ? error.message : String(error);
	if (asJson) {
		return JSON.stringify({ success: false, error: message }, null, 2);
	}
	return `Error: ${message}`;
}

/**
 * Runs the CLI with the given arguments.
 * Returns a CliResult (exit code + output) instead of calling process.exit,
 * making it testable.
 *
 * @param argv - Raw arguments (typically process.argv.slice(2))
 * @returns The CLI result with exit code and output text
 */
export async function run(argv: string[]): Promise<CliResult> {
	const { flags, parsed } = parseGlobalFlags(argv);

	// Help
	if (flags.help || parsed._.length === 0) {
		return { exitCode: EXIT_SUCCESS, output: generateHelpText() };
	}

	// Version
	if (flags.version) {
		return { exitCode: EXIT_SUCCESS, output: 'cypress-cli 0.1.0' };
	}

	// Parse and validate the command
	let parsedCommand;
	try {
		// Build the argv object for parseCommand: _ is the positional args,
		// plus all flags (except global ones)
		const commandArgv: Record<string, unknown> = { _: parsed._ };
		for (const [key, value] of Object.entries(parsed)) {
			if (key === '_') continue;
			// Skip global flags
			if (['json', 'session', 'help', 'version', 'j', 's', 'h', 'v'].includes(key)) continue;
			commandArgv[key] = value;
		}

		parsedCommand = parseCommand(
			commandArgv as { _: string[]; [key: string]: unknown },
			commandRegistry,
		);
	} catch (err) {
		if (err instanceof CommandValidationError) {
			return {
				exitCode: EXIT_VALIDATION_ERROR,
				output: formatError(err, flags.json),
			};
		}
		throw err;
	}

	// Send the command to the daemon
	try {
		const session = new ClientSession({
			session: flags.session,
		});

		const result = await session.sendCommand(parsedCommand);

		if (!result.success) {
			return {
				exitCode: EXIT_COMMAND_ERROR,
				output: formatResult(result, flags.json),
			};
		}

		return {
			exitCode: EXIT_SUCCESS,
			output: formatResult(result, flags.json),
		};
	} catch (err) {
		if (err instanceof ClientConnectionError) {
			return {
				exitCode: EXIT_CONNECTION_ERROR,
				output: formatError(err, flags.json),
			};
		}
		return {
			exitCode: EXIT_COMMAND_ERROR,
			output: formatError(err, flags.json),
		};
	}
}

/**
 * Main CLI entry point. Parses process.argv, runs the command, and exits.
 */
export async function main(): Promise<void> {
	const result = await run(process.argv.slice(2));
	if (result.output) {
		if (result.exitCode === EXIT_SUCCESS) {
			process.stdout.write(result.output + '\n');
		} else {
			process.stderr.write(result.output + '\n');
		}
	}
	process.exit(result.exitCode);
}
