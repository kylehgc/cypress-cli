/**
 * CLI client module: one-shot commands sent to the daemon over a Unix socket.
 */
export { main, run, parseGlobalFlags, formatResult, formatError, generateHelpText } from './cli.js';
export type { CliResult, GlobalFlags } from './cli.js';

export { ClientSession } from './session.js';
export type { ClientSessionOptions, ClientResult } from './session.js';

export {
	sendAndReceive,
	ClientConnectionError,
} from './socketConnection.js';
export type { ClientSocketOptions } from './socketConnection.js';

export { startRepl, splitArgv } from './repl.js';
export type { ReplOptions } from './repl.js';

export {
	declareCommand,
	parseCommand,
	CommandValidationError,
} from './command.js';
export type {
	CommandSchema,
	CommandDefinition,
	ParsedCommand,
	CommandRegistryEntry,
	PositionalMapping,
	CommandCategory,
} from './command.js';

export { allCommands, buildRegistry, commandRegistry } from './commands.js';
