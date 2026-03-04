/**
 * Structured logger for the cypress-cli project.
 *
 * Two output modes:
 * - **json**: Structured JSON to stderr (used by the daemon)
 * - **human**: Human-readable text to stderr (used by the CLI client)
 *
 * Log levels (in order of severity): error, warn, info, debug.
 * A message is emitted only when its level is >= the configured threshold.
 *
 * Configuration:
 * - CLI: `--verbose` / `-v` sets level to `debug`; default is `info`
 * - Daemon: `CYPRESS_CLI_LOG_LEVEL` env var; default is `info`
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Supported log levels in order of decreasing severity.
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * Output format for log messages.
 */
export type LogFormat = 'json' | 'human';

/**
 * Options for creating a Logger instance.
 */
export interface LoggerOptions {
	/** Minimum log level to emit. Messages below this level are suppressed. */
	level?: LogLevel;
	/** Output format: 'json' for structured JSON, 'human' for readable text. */
	format?: LogFormat;
	/** Component name included in log entries (e.g., 'daemon', 'client'). */
	component?: string;
	/** Override the output stream (defaults to process.stderr). */
	output?: { write(data: string): void };
}

/**
 * A structured JSON log entry emitted in 'json' mode.
 */
export interface LogEntry {
	timestamp: string;
	level: LogLevel;
	component?: string;
	message: string;
	[key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Numeric priority for each log level (lower = more severe).
 * A message is emitted when its priority <= the threshold priority.
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
	error: 0,
	warn: 1,
	info: 2,
	debug: 3,
};

/**
 * Human-readable prefixes for each log level.
 */
const LOG_LEVEL_PREFIX: Record<LogLevel, string> = {
	error: 'ERROR',
	warn: 'WARN',
	info: 'INFO',
	debug: 'DEBUG',
};

/**
 * Environment variable name for daemon log level.
 */
export const LOG_LEVEL_ENV_VAR = 'CYPRESS_CLI_LOG_LEVEL';

/**
 * Valid log level strings for validation.
 */
const VALID_LOG_LEVELS: ReadonlySet<string> = new Set([
	'error',
	'warn',
	'info',
	'debug',
]);

/**
 * Reserved top-level keys in JSON log entries that callers cannot overwrite.
 */
const RESERVED_LOG_KEYS: ReadonlySet<string> = new Set([
	'timestamp',
	'level',
	'component',
	'message',
]);

// ---------------------------------------------------------------------------
// Logger class
// ---------------------------------------------------------------------------

/**
 * Structured logger with level filtering and two output formats.
 *
 * @example
 * ```ts
 * const log = new Logger({ level: 'debug', format: 'human', component: 'client' });
 * log.info('Connected to daemon', { socketPath: '/tmp/cypress-cli/default.sock' });
 * log.debug('Sending command', { command: 'click', ref: 'e5' });
 * log.error('Connection failed', { error: err.message });
 * ```
 */
export class Logger {
	private _level: LogLevel;
	private _format: LogFormat;
	private _component: string | undefined;
	private _output: { write(data: string): void };

	constructor(options: LoggerOptions = {}) {
		this._level = options.level ?? 'info';
		this._format = options.format ?? 'human';
		this._component = options.component;
		this._output = options.output ?? process.stderr;
	}

	/**
	 * The current minimum log level.
	 */
	get level(): LogLevel {
		return this._level;
	}

	/**
	 * The current output format.
	 */
	get format(): LogFormat {
		return this._format;
	}

	/**
	 * Log an error-level message.
	 */
	error(message: string, data?: Record<string, unknown>): void {
		this._log('error', message, data);
	}

	/**
	 * Log a warn-level message.
	 */
	warn(message: string, data?: Record<string, unknown>): void {
		this._log('warn', message, data);
	}

	/**
	 * Log an info-level message.
	 */
	info(message: string, data?: Record<string, unknown>): void {
		this._log('info', message, data);
	}

	/**
	 * Log a debug-level message.
	 */
	debug(message: string, data?: Record<string, unknown>): void {
		this._log('debug', message, data);
	}

	/**
	 * Internal log method. Checks level threshold and formats the message.
	 */
	private _log(
		level: LogLevel,
		message: string,
		data?: Record<string, unknown>,
	): void {
		if (LOG_LEVEL_PRIORITY[level] > LOG_LEVEL_PRIORITY[this._level]) {
			return;
		}

		if (this._format === 'json') {
			this._writeJson(level, message, data);
		} else {
			this._writeHuman(level, message, data);
		}
	}

	/**
	 * Write a structured JSON log entry.
	 */
	private _writeJson(
		level: LogLevel,
		message: string,
		data?: Record<string, unknown>,
	): void {
		// Filter out reserved top-level keys so callers cannot overwrite them
		const safeData = data
			? Object.fromEntries(
					Object.entries(data).filter(([key]) => !RESERVED_LOG_KEYS.has(key)),
			  )
			: undefined;

		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level,
			...(this._component && { component: this._component }),
			message,
			...safeData,
		};
		try {
			this._output.write(JSON.stringify(entry) + '\n');
		} catch {
			// Best-effort fallback when JSON.stringify fails (e.g. circular refs, BigInt)
			this._output.write(
				JSON.stringify({ timestamp: entry.timestamp, level, message: `${message} [data unserializable]` }) + '\n',
			);
		}
	}

	/**
	 * Write a human-readable log line.
	 */
	private _writeHuman(
		level: LogLevel,
		message: string,
		data?: Record<string, unknown>,
	): void {
		const prefix = LOG_LEVEL_PREFIX[level];
		const component = this._component ? `[${this._component}] ` : '';
		let line = `${prefix} ${component}${message}`;

		if (data && Object.keys(data).length > 0) {
			const pairs = Object.entries(data)
				.map(([k, v]) => {
					if (typeof v === 'string') return `${k}=${v}`;
					try {
						return `${k}=${JSON.stringify(v)}`;
					} catch {
						return `${k}=[unserializable]`;
					}
				})
				.join(' ');
			line += ` ${pairs}`;
		}

		this._output.write(line + '\n');
	}
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Parses a log level from an environment variable value.
 * Returns the parsed level or the default if the value is invalid or absent.
 *
 * @param value - The raw env var value
 * @param defaultLevel - Fallback level if value is invalid
 * @returns A valid LogLevel
 */
export function parseLogLevel(
	value: string | undefined,
	defaultLevel: LogLevel = 'info',
): LogLevel {
	if (!value) return defaultLevel;
	const normalized = value.toLowerCase().trim();
	if (VALID_LOG_LEVELS.has(normalized)) {
		return normalized as LogLevel;
	}
	return defaultLevel;
}

/**
 * Creates a logger configured for the daemon process.
 *
 * Uses JSON format on stderr. Log level is read from
 * the CYPRESS_CLI_LOG_LEVEL environment variable (default: 'info').
 */
export function createDaemonLogger(
	options?: Partial<LoggerOptions>,
): Logger {
	const envLevel = parseLogLevel(process.env[LOG_LEVEL_ENV_VAR]);
	return new Logger({
		level: envLevel,
		format: 'json',
		component: 'daemon',
		...options,
	});
}

/**
 * Creates a logger configured for the CLI client process.
 *
 * Uses human-readable format on stderr. When `verbose` is true,
 * the log level is set to 'debug'; otherwise defaults to 'info'.
 *
 * @param verbose - Whether --verbose / -v was passed
 */
export function createClientLogger(
	verbose?: boolean,
	options?: Partial<LoggerOptions>,
): Logger {
	return new Logger({
		level: verbose ? 'debug' : 'info',
		format: 'human',
		component: 'client',
		...options,
	});
}
