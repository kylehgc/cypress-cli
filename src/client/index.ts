#!/usr/bin/env node

/**
 * CLI entry point for cypress-cli.
 */
export {
	declareCommand,
	parseCommand,
	CommandValidationError,
	type CommandCategory,
	type CommandDefinition,
	type CommandSchema,
	type ParsedCommand,
	type PositionalMapping,
	type CommandRegistryEntry,
} from './command.js';

export { allCommands, buildRegistry, commandRegistry } from './commands.js';
