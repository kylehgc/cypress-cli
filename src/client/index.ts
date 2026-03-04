#!/usr/bin/env node

/**
 * CLI entry point for cypress-cli.
 *
 * This module re-exports the public API and, when executed directly,
 * runs the CLI with process.argv.
 */

export { run, parseArgs, formatResult, formatError, EXIT_SUCCESS, EXIT_COMMAND_ERROR, EXIT_CONNECTION_ERROR, EXIT_VALIDATION_ERROR } from './cli.js';
export { ClientSession } from './session.js';
export { ClientSocketConnection, ClientConnectionError, ClientTimeoutError } from './socketConnection.js';
export { startRepl, splitArgs } from './repl.js';
export { parseCommand, CommandValidationError } from './command.js';
export type { ParsedCommand, CommandSchema, CommandCategory, CommandDefinition, CommandRegistryEntry, PositionalMapping } from './command.js';
export { commandRegistry, buildRegistry, allCommands } from './commands.js';

import { run } from './cli.js';

/**
 * When this module is the main entry point, run the CLI.
 * ES module detection: check if this file is being run directly via node.
 */
const isMain = process.argv[1] &&
	(process.argv[1].endsWith('/client/index.js') ||
	 process.argv[1].endsWith('/client/index.ts'));

if (isMain) {
	run(process.argv.slice(2)).then((exitCode) => {
		process.exitCode = exitCode;
	}).catch((err) => {
		console.error(err instanceof Error ? (err.stack || err.message) : err);
		process.exitCode = 1;
	});
}
