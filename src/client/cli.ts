/**
 * CLI entry point: parses arguments, validates commands, dispatches to daemon.
 *
 * Exit codes:
 *   0 — success
 *   1 — command execution error (daemon reported failure)
 *   2 — connection error (daemon not running, socket not found)
 *   3 — validation error (unknown command, missing args, bad flags)
 */

import { createRequire } from 'node:module';

import minimist from 'minimist';
import { z } from 'zod';

import { parseCommand, CommandValidationError } from './command.js';
import { commandRegistry, allCommands } from './commands.js';
import { ClientSession, type ClientResult } from './session.js';
import { ClientConnectionError } from './socketConnection.js';
import { openSession } from './open.js';
import { createClientLogger } from '../shared/logger.js';

/**
 * Reads the package version from package.json at runtime.
 * Uses createRequire because ESM cannot import JSON directly from outside rootDir.
 */
function getPackageVersion(): string {
	try {
		const require = createRequire(import.meta.url);
		const pkg = require('../../package.json') as { version: string };
		return pkg.version;
	} catch {
		return '0.0.0';
	}
}

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
	/** Enable debug-level logging. */
	verbose: boolean;
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
		boolean: ['json', 'help', 'version', 'verbose', 'force', 'multiple', 'headed', 'diff'],
		string: [
			'session',
			'browser',
			'config',
			'file',
			'resume',
			'format',
			'describe',
			'it',
			'baseUrl',
		],
		alias: {
			s: 'session',
			h: 'help',
			v: 'verbose',
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
		verbose: parsed['verbose'] === true,
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
			const usage = getCommandUsage(cmd.name);
			lines.push(`    ${usage.padEnd(30)} ${cmd.description}`);
		}
		lines.push('');
	}

	lines.push('Global options:');
	lines.push('  --json, -j       Output machine-readable JSON');
	lines.push('  --session, -s    Target a specific session by name');
	lines.push('  --verbose, -v    Enable debug logging');
	lines.push('  --help, -h       Show this help text');
	lines.push('  --version        Show version');

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
		const resultObj = result.result as Record<string, unknown> | undefined;
		const snapshot =
			typeof resultObj?.['snapshot'] === 'string' ? resultObj['snapshot'] : undefined;
		const lines = [`Error: ${result.error ?? 'Unknown error'}`];
		if (snapshot) {
			lines.push('', 'Current snapshot:', snapshot);
		}
		return lines.join('\n');
	}

	const resultObj = result.result as Record<string, unknown> | undefined;
	if (typeof resultObj?.['filePath'] === 'string') {
		return `Wrote test file: ${resultObj['filePath']}`;
	}
	if (typeof resultObj?.['testFile'] === 'string') {
		return String(resultObj['testFile']);
	}

	// If there's a snapshot, show it prominently
	if (resultObj?.snapshot) {
		return String(resultObj.snapshot);
	}

	// For non-snapshot results, show as key-value pairs
	if (resultObj) {
		const rest = { ...resultObj };
		delete rest.success;
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
	const log = createClientLogger(flags.verbose);

	// Version (check before help so `--version` alone works)
	if (flags.version) {
		return { exitCode: EXIT_SUCCESS, output: `cypress-cli ${getPackageVersion()}` };
	}

	// Help (explicit flag or no positional arguments)
	if (flags.help || parsed._.length === 0) {
		return { exitCode: EXIT_SUCCESS, output: generateHelpText() };
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
			if (['json', 'session', 'help', 'version', 'verbose', 'j', 's', 'h', 'v'].includes(key)) continue;
			commandArgv[key] = value;
		}

		parsedCommand = parseCommand(
			commandArgv as { _: string[]; [key: string]: unknown },
			commandRegistry,
		);
		log.debug('Parsed command', { command: parsedCommand.command });
	} catch (err) {
		if (err instanceof CommandValidationError) {
			log.debug('Validation error', { error: err.message });
			return {
				exitCode: EXIT_VALIDATION_ERROR,
				output: formatError(err, flags.json),
			};
		}
		throw err;
	}

	// Send the command to the daemon
	try {
		if (parsedCommand.command === 'open') {
			const result = await openSession(parsedCommand, flags.session);
			return {
				exitCode: result.success ? EXIT_SUCCESS : EXIT_COMMAND_ERROR,
				output: formatResult(result, flags.json),
			};
		}

		const session = new ClientSession({ session: flags.session });

		log.debug('Sending command to daemon', { command: parsedCommand.command, session: flags.session });
		const result = await session.sendCommand(parsedCommand);

		if (!result.success) {
			log.debug('Command failed', { error: result.error });
			return {
				exitCode: EXIT_COMMAND_ERROR,
				output: formatResult(result, flags.json),
			};
		}

		log.debug('Command succeeded');
		return {
			exitCode: EXIT_SUCCESS,
			output: formatResult(result, flags.json),
		};
	} catch (err) {
		if (err instanceof ClientConnectionError) {
			log.debug('Connection error', { error: err.message });
			return {
				exitCode: EXIT_CONNECTION_ERROR,
				output: formatError(err, flags.json),
			};
		}
		log.debug('Unexpected error', { error: err instanceof Error ? err.message : String(err) });
		return {
			exitCode: EXIT_COMMAND_ERROR,
			output: formatError(err, flags.json),
		};
	}
}

function getCommandUsage(commandName: string): string {
	const entry = commandRegistry.get(commandName);
	if (!entry) {
		return commandName;
	}

	if (!(entry.schema.args instanceof z.ZodObject)) {
		return commandName;
	}

	const shape = entry.schema.args.shape;
	const positionalTokens = entry.positionals.map((name) => {
		const argSchema = shape[name];
		return argSchema?.isOptional?.() ? `[${name}]` : `<${name}>`;
	});

	return [commandName, ...positionalTokens].join(' ');
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
