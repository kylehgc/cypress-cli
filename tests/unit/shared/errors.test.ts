import { describe, it, expect } from 'vitest';

import {
	CypressCliError,
	ConnectionError,
	TimeoutError,
	ValidationError,
	CommandError,
	SessionError,
	serializeError,
	deserializeError,
	isSerializedError,
	type SerializedError,
} from '../../../src/shared/errors.js';

// ---------------------------------------------------------------------------
// Error hierarchy
// ---------------------------------------------------------------------------

describe('CypressCliError', () => {
	it('is an instance of Error', () => {
		const err = new CypressCliError('COMMAND_ERROR', 'something broke');
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(CypressCliError);
	});

	it('sets name, code, and message', () => {
		const err = new CypressCliError('VALIDATION_ERROR', 'bad input');
		expect(err.name).toBe('CypressCliError');
		expect(err.code).toBe('VALIDATION_ERROR');
		expect(err.message).toBe('bad input');
	});

	it('supports cause chaining', () => {
		const cause = new Error('underlying problem');
		const err = new CypressCliError('CONNECTION_ERROR', 'wrapper', cause);
		expect(err.cause).toBe(cause);
	});

	it('has no cause when not provided', () => {
		const err = new CypressCliError('COMMAND_ERROR', 'no cause');
		expect(err.cause).toBeUndefined();
	});

	it('serializes to JSON via toJSON()', () => {
		const err = new CypressCliError('TIMEOUT_ERROR', 'timed out');
		const json = err.toJSON();
		expect(json).toEqual({
			type: 'error',
			code: 'TIMEOUT_ERROR',
			message: 'timed out',
		});
	});

	it('toJSON() does not include cause', () => {
		const err = new CypressCliError(
			'COMMAND_ERROR',
			'failed',
			new Error('root'),
		);
		const json = err.toJSON();
		expect(json).not.toHaveProperty('cause');
		expect(Object.keys(json)).toEqual(['type', 'code', 'message']);
	});
});

// ---------------------------------------------------------------------------
// Subclasses
// ---------------------------------------------------------------------------

describe('ConnectionError', () => {
	it('extends CypressCliError with CONNECTION_ERROR code', () => {
		const err = new ConnectionError('socket broke');
		expect(err).toBeInstanceOf(CypressCliError);
		expect(err).toBeInstanceOf(ConnectionError);
		expect(err.name).toBe('ConnectionError');
		expect(err.code).toBe('CONNECTION_ERROR');
		expect(err.message).toBe('socket broke');
	});

	it('supports cause chaining', () => {
		const cause = new Error('ECONNREFUSED');
		const err = new ConnectionError('cannot connect', cause);
		expect(err.cause).toBe(cause);
	});
});

describe('TimeoutError', () => {
	it('extends CypressCliError with TIMEOUT_ERROR code', () => {
		const err = new TimeoutError('operation timed out after 5000ms');
		expect(err).toBeInstanceOf(CypressCliError);
		expect(err).toBeInstanceOf(TimeoutError);
		expect(err.name).toBe('TimeoutError');
		expect(err.code).toBe('TIMEOUT_ERROR');
	});
});

describe('ValidationError', () => {
	it('extends CypressCliError with VALIDATION_ERROR code', () => {
		const err = new ValidationError('missing required arg "ref"');
		expect(err).toBeInstanceOf(CypressCliError);
		expect(err).toBeInstanceOf(ValidationError);
		expect(err.name).toBe('ValidationError');
		expect(err.code).toBe('VALIDATION_ERROR');
	});
});

describe('CommandError', () => {
	it('extends CypressCliError with COMMAND_ERROR code', () => {
		const err = new CommandError('cy.get() timed out');
		expect(err).toBeInstanceOf(CypressCliError);
		expect(err).toBeInstanceOf(CommandError);
		expect(err.name).toBe('CommandError');
		expect(err.code).toBe('COMMAND_ERROR');
	});
});

describe('SessionError', () => {
	it('extends CypressCliError with SESSION_ERROR code', () => {
		const err = new SessionError('no session running');
		expect(err).toBeInstanceOf(CypressCliError);
		expect(err).toBeInstanceOf(SessionError);
		expect(err.name).toBe('SessionError');
		expect(err.code).toBe('SESSION_ERROR');
	});
});

// ---------------------------------------------------------------------------
// serializeError
// ---------------------------------------------------------------------------

describe('serializeError', () => {
	it('serializes a CypressCliError', () => {
		const err = new ConnectionError('socket broke');
		expect(serializeError(err)).toEqual({
			type: 'error',
			code: 'CONNECTION_ERROR',
			message: 'socket broke',
		});
	});

	it('serializes a subclass and uses its code', () => {
		const err = new TimeoutError('timed out');
		const serialized = serializeError(err);
		expect(serialized.code).toBe('TIMEOUT_ERROR');
	});

	it('serializes a plain Error as COMMAND_ERROR', () => {
		const err = new Error('unexpected');
		expect(serializeError(err)).toEqual({
			type: 'error',
			code: 'COMMAND_ERROR',
			message: 'unexpected',
		});
	});

	it('serializes a string as COMMAND_ERROR', () => {
		expect(serializeError('oops')).toEqual({
			type: 'error',
			code: 'COMMAND_ERROR',
			message: 'oops',
		});
	});

	it('serializes a number as COMMAND_ERROR', () => {
		expect(serializeError(42)).toEqual({
			type: 'error',
			code: 'COMMAND_ERROR',
			message: '42',
		});
	});
});

// ---------------------------------------------------------------------------
// deserializeError
// ---------------------------------------------------------------------------

describe('deserializeError', () => {
	it('deserializes CONNECTION_ERROR to ConnectionError', () => {
		const data: SerializedError = { type: 'error', code: 'CONNECTION_ERROR', message: 'fail' };
		const err = deserializeError(data);
		expect(err).toBeInstanceOf(ConnectionError);
		expect(err.code).toBe('CONNECTION_ERROR');
		expect(err.message).toBe('fail');
	});

	it('deserializes TIMEOUT_ERROR to TimeoutError', () => {
		const data: SerializedError = { type: 'error', code: 'TIMEOUT_ERROR', message: 'slow' };
		const err = deserializeError(data);
		expect(err).toBeInstanceOf(TimeoutError);
	});

	it('deserializes VALIDATION_ERROR to ValidationError', () => {
		const data: SerializedError = { type: 'error', code: 'VALIDATION_ERROR', message: 'bad' };
		const err = deserializeError(data);
		expect(err).toBeInstanceOf(ValidationError);
	});

	it('deserializes COMMAND_ERROR to CommandError', () => {
		const data: SerializedError = { type: 'error', code: 'COMMAND_ERROR', message: 'nope' };
		const err = deserializeError(data);
		expect(err).toBeInstanceOf(CommandError);
	});

	it('deserializes SESSION_ERROR to SessionError', () => {
		const data: SerializedError = { type: 'error', code: 'SESSION_ERROR', message: 'gone' };
		const err = deserializeError(data);
		expect(err).toBeInstanceOf(SessionError);
	});

	it('round-trips through serializeError → deserializeError', () => {
		const original = new TimeoutError('timed out after 30s');
		const serialized = serializeError(original);
		const deserialized = deserializeError(serialized);
		expect(deserialized).toBeInstanceOf(TimeoutError);
		expect(deserialized.code).toBe('TIMEOUT_ERROR');
		expect(deserialized.message).toBe('timed out after 30s');
	});
});

// ---------------------------------------------------------------------------
// isSerializedError
// ---------------------------------------------------------------------------

describe('isSerializedError', () => {
	it('returns true for valid serialized errors', () => {
		expect(isSerializedError({ type: 'error', code: 'COMMAND_ERROR', message: 'fail' })).toBe(true);
	});

	it('returns false for null', () => {
		expect(isSerializedError(null)).toBe(false);
	});

	it('returns false for non-objects', () => {
		expect(isSerializedError('string')).toBe(false);
		expect(isSerializedError(42)).toBe(false);
	});

	it('returns false when type is not "error"', () => {
		expect(isSerializedError({ type: 'response', code: 'COMMAND_ERROR', message: 'y' })).toBe(false);
	});

	it('returns false when code is not a known ErrorCode', () => {
		expect(isSerializedError({ type: 'error', code: 'UNKNOWN_CODE', message: 'y' })).toBe(false);
	});

	it('returns false when code is missing', () => {
		expect(isSerializedError({ type: 'error', message: 'y' })).toBe(false);
	});

	it('returns false when message is missing', () => {
		expect(isSerializedError({ type: 'error', code: 'X' })).toBe(false);
	});

	it('returns false when code is not a string', () => {
		expect(isSerializedError({ type: 'error', code: 123, message: 'y' })).toBe(false);
	});
});
