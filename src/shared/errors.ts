/**
 * Typed error hierarchy for the cypress-cli project.
 *
 * All errors extend CypressCliError which carries a machine-readable `code`,
 * a human-readable `message`, and an optional `cause` for chaining.
 *
 * These error classes provide serialization helpers for structured error
 * responses. The daemon protocol currently sends `{ id, error: string }`;
 * the `serializeError` / `deserializeError` helpers here prepare for
 * migrating to richer `{ type: 'error', code, message }` error payloads.
 */

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

/**
 * Machine-readable error codes used across the wire protocol.
 */
export type ErrorCode =
	| 'CONNECTION_ERROR'
	| 'TIMEOUT_ERROR'
	| 'VALIDATION_ERROR'
	| 'COMMAND_ERROR'
	| 'SESSION_ERROR';

/**
 * Set of valid error codes for runtime validation.
 */
const VALID_ERROR_CODES: ReadonlySet<string> = new Set([
	'CONNECTION_ERROR',
	'TIMEOUT_ERROR',
	'VALIDATION_ERROR',
	'COMMAND_ERROR',
	'SESSION_ERROR',
]);

// ---------------------------------------------------------------------------
// Base class
// ---------------------------------------------------------------------------

/**
 * Base error class for all cypress-cli errors.
 *
 * Carries a machine-readable `code` field for programmatic handling and
 * supports `cause` chaining for wrapping lower-level errors.
 */
export class CypressCliError extends Error {
	readonly code: ErrorCode;

	constructor(code: ErrorCode, message: string, cause?: Error) {
		super(message, cause ? { cause } : undefined);
		this.name = 'CypressCliError';
		this.code = code;
	}

	/**
	 * Serializes this error to a plain object suitable for sending over the
	 * socket as JSON.
	 */
	toJSON(): { type: 'error'; code: ErrorCode; message: string } {
		return {
			type: 'error',
			code: this.code,
			message: this.message,
		};
	}
}

// ---------------------------------------------------------------------------
// Subclasses
// ---------------------------------------------------------------------------

/**
 * Socket / IPC connection failures.
 */
export class ConnectionError extends CypressCliError {
	constructor(message: string, cause?: Error) {
		super('CONNECTION_ERROR', message, cause);
		this.name = 'ConnectionError';
	}
}

/**
 * Operation timeout (socket, command execution, Cypress response).
 */
export class TimeoutError extends CypressCliError {
	constructor(message: string, cause?: Error) {
		super('TIMEOUT_ERROR', message, cause);
		this.name = 'TimeoutError';
	}
}

/**
 * Input validation failures (bad CLI args, malformed messages).
 */
export class ValidationError extends CypressCliError {
	constructor(message: string, cause?: Error) {
		super('VALIDATION_ERROR', message, cause);
		this.name = 'ValidationError';
	}
}

/**
 * Cypress command execution failures (element not found, assertion failed).
 */
export class CommandError extends CypressCliError {
	constructor(message: string, cause?: Error) {
		super('COMMAND_ERROR', message, cause);
		this.name = 'CommandError';
	}
}

/**
 * Session lifecycle errors (no session, session already exists, invalid state).
 */
export class SessionError extends CypressCliError {
	constructor(message: string, cause?: Error) {
		super('SESSION_ERROR', message, cause);
		this.name = 'SessionError';
	}
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/**
 * Structured error shape sent over the socket boundary.
 */
export interface SerializedError {
	type: 'error';
	code: ErrorCode;
	message: string;
}

/**
 * Serializes any error into the structured wire format.
 * CypressCliError instances use their own code; plain Errors become COMMAND_ERROR.
 *
 * @param error - The error to serialize
 * @returns A plain object suitable for JSON.stringify
 */
export function serializeError(error: unknown): SerializedError {
	if (error instanceof CypressCliError) {
		return error.toJSON();
	}

	const message = error instanceof Error ? error.message : String(error);
	return {
		type: 'error',
		code: 'COMMAND_ERROR',
		message,
	};
}

/**
 * Deserializes a structured error from the wire format back into a
 * CypressCliError instance.
 *
 * @param data - The parsed JSON error object
 * @returns A CypressCliError subclass matching the error code
 */
export function deserializeError(data: SerializedError): CypressCliError {
	switch (data.code) {
		case 'CONNECTION_ERROR':
			return new ConnectionError(data.message);
		case 'TIMEOUT_ERROR':
			return new TimeoutError(data.message);
		case 'VALIDATION_ERROR':
			return new ValidationError(data.message);
		case 'COMMAND_ERROR':
			return new CommandError(data.message);
		case 'SESSION_ERROR':
			return new SessionError(data.message);
		default:
			return new CypressCliError(
				data.code,
				data.message,
			);
	}
}

/**
 * Type guard: checks whether a value is a SerializedError.
 * Validates that `code` is one of the known ErrorCode values.
 */
export function isSerializedError(value: unknown): value is SerializedError {
	if (typeof value !== 'object' || value === null) return false;
	const obj = value as Record<string, unknown>;
	return (
		obj.type === 'error' &&
		typeof obj.code === 'string' &&
		VALID_ERROR_CODES.has(obj.code as string) &&
		typeof obj.message === 'string'
	);
}
