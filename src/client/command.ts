import { z } from 'zod';

/**
 * Command categories that group related commands.
 */
export type CommandCategory =
	| 'core'
	| 'navigation'
	| 'interaction'
	| 'keyboard'
	| 'assertion'
	| 'execution'
	| 'export'
	| 'wait'
	| 'network';

/**
 * Configuration object passed to declareCommand to define a CLI command.
 */
export interface CommandDefinition<
	TArgs extends z.ZodTypeAny = z.ZodTypeAny,
	TOptions extends z.ZodTypeAny = z.ZodTypeAny,
> {
	name: string;
	category: CommandCategory;
	description: string;
	args: TArgs;
	options: TOptions;
}

/**
 * A fully declared command with its zod schemas for args and options.
 */
export interface CommandSchema<
	TArgs extends z.ZodTypeAny = z.ZodTypeAny,
	TOptions extends z.ZodTypeAny = z.ZodTypeAny,
> {
	name: string;
	category: CommandCategory;
	description: string;
	args: TArgs;
	options: TOptions;
}

/**
 * The result of parsing raw CLI arguments against a command schema.
 */
export interface ParsedCommand<
	TArgs = Record<string, unknown>,
	TOptions = Record<string, unknown>,
> {
	command: string;
	args: TArgs;
	options: TOptions;
}

/**
 * Declares a CLI command with typed zod schemas for arguments and options.
 *
 * @param definition - The command name, category, description, and zod schemas
 * @returns A frozen CommandSchema object
 */
export function declareCommand<
	TArgs extends z.ZodTypeAny,
	TOptions extends z.ZodTypeAny,
>(
	definition: CommandDefinition<TArgs, TOptions>,
): CommandSchema<TArgs, TOptions> {
	return Object.freeze({
		name: definition.name,
		category: definition.category,
		description: definition.description,
		args: definition.args,
		options: definition.options,
	});
}

/**
 * Mapping of positional argument names for each command.
 * Used by parseCommand to map raw positional args (from minimist's `_` array)
 * to named fields in the args schema.
 */
export type PositionalMapping = readonly string[];

/**
 * Registry entry pairing a command schema with its positional argument mapping.
 */
export interface CommandRegistryEntry<
	TArgs extends z.ZodTypeAny = z.ZodTypeAny,
	TOptions extends z.ZodTypeAny = z.ZodTypeAny,
> {
	schema: CommandSchema<TArgs, TOptions>;
	positionals: PositionalMapping;
}

/**
 * Parses raw CLI arguments (from minimist) into a validated ParsedCommand.
 *
 * @param argv - The raw minimist-parsed arguments object with `_` array
 *               containing [commandName, ...positionalArgs]
 * @param registry - Map of command name → CommandRegistryEntry
 * @returns A validated ParsedCommand with typed args and options
 * @throws {CommandValidationError} If the command is unknown or args/options fail validation
 */
export function parseCommand(
	argv: { _: string[]; [key: string]: unknown },
	registry: ReadonlyMap<string, CommandRegistryEntry>,
): ParsedCommand {
	const [commandName, ...positionals] = argv._;

	if (!commandName) {
		throw new CommandValidationError(
			'No command provided. Run `cypress-cli --help` for available commands.',
		);
	}

	const entry = registry.get(commandName);
	if (!entry) {
		throw new CommandValidationError(
			`Unknown command "${commandName}". Run \`cypress-cli --help\` for available commands.`,
		);
	}

	// Map positional args to named fields.
	// Also accept named flags for declared positionals (e.g. `open --url <url>`)
	// so that both `open <url>` and `open --url <url>` work.
	const argsObj: Record<string, unknown> = {};
	for (let i = 0; i < entry.positionals.length; i++) {
		const name = entry.positionals[i];
		if (i < positionals.length) {
			argsObj[name] = positionals[i];
		} else if (name in argv && argv[name] !== undefined) {
			argsObj[name] = argv[name];
		}
	}

	// Handle extra positional args:
	// - For commands whose last positional is a free-text field (e.g. "text", "value"),
	//   join the remaining positionals into that argument.
	// - For all other commands, reject extra positionals explicitly.
	if (positionals.length > entry.positionals.length) {
		const lastPositionalName = entry.positionals[entry.positionals.length - 1];
		const allowJoinRemainder =
			lastPositionalName === 'text' ||
			lastPositionalName === 'value' ||
			lastPositionalName === 'code';

		if (allowJoinRemainder) {
			const joinedRemaining = positionals
				.slice(entry.positionals.length - 1)
				.join(' ');
			argsObj[lastPositionalName] = joinedRemaining;
		} else {
			throw new CommandValidationError(
				`Too many positional arguments for "${commandName}": expected ${entry.positionals.length}, got ${positionals.length}.`,
			);
		}
	}

	// Extract options (everything from argv except _ and command-specific positionals)
	const optionsObj: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(argv)) {
		if (key === '_') continue;
		optionsObj[key] = value;
	}

	// Validate args against schema
	const argsResult = entry.schema.args.safeParse(argsObj);
	if (!argsResult.success) {
		const issues = argsResult.error.issues
			.map((issue: z.ZodIssue) => `  ${issue.path.join('.')}: ${issue.message}`)
			.join('\n');
		throw new CommandValidationError(
			`Invalid arguments for "${commandName}":\n${issues}`,
		);
	}

	// Validate options against schema
	const optionsResult = entry.schema.options.safeParse(optionsObj);
	if (!optionsResult.success) {
		const issues = optionsResult.error.issues
			.map((issue: z.ZodIssue) => `  ${issue.path.join('.')}: ${issue.message}`)
			.join('\n');
		throw new CommandValidationError(
			`Invalid options for "${commandName}":\n${issues}`,
		);
	}

	return {
		command: entry.schema.name,
		args: argsResult.data as Record<string, unknown>,
		options: optionsResult.data as Record<string, unknown>,
	};
}

/**
 * Error thrown when command validation fails (unknown command, missing args, etc.).
 */
export class CommandValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CommandValidationError';
	}
}
