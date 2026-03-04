/**
 * Public API for shared infrastructure (errors, logging).
 */

export {
	CypressCliError,
	ConnectionError,
	TimeoutError,
	ValidationError,
	CommandError,
	SessionError,
	serializeError,
	deserializeError,
	isSerializedError,
	type ErrorCode,
	type SerializedError,
} from './errors.js';

export {
	Logger,
	createDaemonLogger,
	createClientLogger,
	parseLogLevel,
	LOG_LEVEL_ENV_VAR,
	type LogLevel,
	type LogFormat,
	type LoggerOptions,
	type LogEntry,
} from './logger.js';
