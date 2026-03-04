import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';

import {
	serializeMessage,
	deserializeMessage,
	isErrorMessage,
	isResponseMessage,
	ProtocolError,
	type CommandMessage,
	type ResponseMessage,
	type ErrorMessage,
	type ProtocolMessage,
} from '../../../src/daemon/protocol.js';
import {
	SocketConnection,
	ConnectionError,
} from '../../../src/daemon/connection.js';

// ---------------------------------------------------------------------------
// Protocol: serialization / deserialization
// ---------------------------------------------------------------------------

describe('serializeMessage', () => {
	it('serializes command to newline-delimited JSON', () => {
		const msg: CommandMessage = {
			id: 1,
			method: 'run',
			params: { args: { _: ['click', 'e5'] } },
		};
		const serialized = serializeMessage(msg);
		expect(serialized).toBe(
			'{"id":1,"method":"run","params":{"args":{"_":["click","e5"]}}}\n',
		);
	});

	it('serializes response message', () => {
		const msg: ResponseMessage = {
			id: 1,
			result: { success: true, snapshot: '- button "OK"' },
		};
		const serialized = serializeMessage(msg);
		expect(serialized).toMatch(/^\{.*\}\n$/);
		const parsed = JSON.parse(serialized.trim());
		expect(parsed.id).toBe(1);
		expect(parsed.result.success).toBe(true);
		expect(parsed.result.snapshot).toBe('- button "OK"');
	});

	it('serializes error message', () => {
		const msg: ErrorMessage = {
			id: 2,
			error: 'Element ref e5 not found',
		};
		const serialized = serializeMessage(msg);
		const parsed = JSON.parse(serialized.trim());
		expect(parsed.id).toBe(2);
		expect(parsed.error).toBe('Element ref e5 not found');
	});

	it('always appends a trailing newline', () => {
		const msg: CommandMessage = {
			id: 99,
			method: 'stop',
			params: { args: { _: ['stop'] } },
		};
		expect(serializeMessage(msg).endsWith('\n')).toBe(true);
	});
});

describe('deserializeMessage', () => {
	it('deserializes a command message', () => {
		const line =
			'{"id":1,"method":"run","params":{"args":{"_":["click","e5"]}}}';
		const msg = deserializeMessage(line) as CommandMessage;
		expect(msg.id).toBe(1);
		expect(msg.method).toBe('run');
		expect(msg.params.args._).toEqual(['click', 'e5']);
	});

	it('deserializes a response message', () => {
		const line = '{"id":1,"result":{"success":true,"snapshot":"..."}}';
		const msg = deserializeMessage(line) as ResponseMessage;
		expect(msg.id).toBe(1);
		expect(msg.result.success).toBe(true);
	});

	it('deserializes an error message', () => {
		const line = '{"id":1,"error":"something went wrong"}';
		const msg = deserializeMessage(line) as ErrorMessage;
		expect(msg.id).toBe(1);
		expect(msg.error).toBe('something went wrong');
	});

	it('trims whitespace from input line', () => {
		const line =
			'  {"id":1,"method":"stop","params":{"args":{"_":["stop"]}}}  ';
		const msg = deserializeMessage(line);
		expect(msg.id).toBe(1);
	});

	it('throws ProtocolError on empty input', () => {
		expect(() => deserializeMessage('')).toThrow(ProtocolError);
		expect(() => deserializeMessage('   ')).toThrow(ProtocolError);
	});

	it('throws ProtocolError on invalid JSON', () => {
		expect(() => deserializeMessage('{bad json')).toThrow(ProtocolError);
		expect(() => deserializeMessage('not json at all')).toThrow(ProtocolError);
	});

	it('throws ProtocolError if parsed value is not an object', () => {
		expect(() => deserializeMessage('"just a string"')).toThrow(ProtocolError);
		expect(() => deserializeMessage('42')).toThrow(ProtocolError);
		expect(() => deserializeMessage('null')).toThrow(ProtocolError);
	});

	it('throws ProtocolError if message lacks numeric id', () => {
		expect(() => deserializeMessage('{"method":"run"}')).toThrow(ProtocolError);
		expect(() => deserializeMessage('{"id":"abc"}')).toThrow(ProtocolError);
	});

	it('throws ProtocolError for structurally invalid messages', () => {
		// Has id but no valid method, result, or error
		expect(() => deserializeMessage('{"id":1}')).toThrow(ProtocolError);
		// Command with invalid method
		expect(() =>
			deserializeMessage('{"id":1,"method":"invalid","params":{"args":{"_":[]}}}'),
		).toThrow(ProtocolError);
		// Response with non-boolean success
		expect(() =>
			deserializeMessage('{"id":1,"result":{"success":"yes"}}'),
		).toThrow(ProtocolError);
	});
});

// ---------------------------------------------------------------------------
// Protocol: type guards
// ---------------------------------------------------------------------------

describe('isErrorMessage', () => {
	it('returns true for error messages', () => {
		const msg: ErrorMessage = { id: 1, error: 'fail' };
		expect(isErrorMessage(msg)).toBe(true);
	});

	it('returns false for response messages', () => {
		const msg: ResponseMessage = { id: 1, result: { success: true } };
		expect(isErrorMessage(msg)).toBe(false);
	});
});

describe('isResponseMessage', () => {
	it('returns true for response messages', () => {
		const msg: ResponseMessage = { id: 1, result: { success: true } };
		expect(isResponseMessage(msg)).toBe(true);
	});

	it('returns false for error messages', () => {
		const msg: ErrorMessage = { id: 1, error: 'fail' };
		expect(isResponseMessage(msg)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// SocketConnection: framing and transport
// ---------------------------------------------------------------------------

describe('SocketConnection', () => {
	let clientStream: PassThrough;
	let connection: SocketConnection;

	beforeEach(() => {
		// Create a PassThrough stream to simulate the underlying connection.
		// clientStream is what the SocketConnection reads from / writes to.
		clientStream = new PassThrough();
		connection = new SocketConnection(clientStream);
	});

	it('parses a single complete message from a data event', () => {
		const received: ProtocolMessage[] = [];
		connection.onMessage((msg) => received.push(msg));

		const msg: CommandMessage = {
			id: 1,
			method: 'run',
			params: { args: { _: ['snapshot'] } },
		};
		clientStream.push(serializeMessage(msg));

		expect(received).toHaveLength(1);
		expect(received[0].id).toBe(1);
	});

	it('handles multiple messages in one buffer', () => {
		const received: ProtocolMessage[] = [];
		connection.onMessage((msg) => received.push(msg));

		const msg1: CommandMessage = {
			id: 1,
			method: 'run',
			params: { args: { _: ['click', 'e1'] } },
		};
		const msg2: CommandMessage = {
			id: 2,
			method: 'run',
			params: { args: { _: ['click', 'e2'] } },
		};
		const msg3: CommandMessage = {
			id: 3,
			method: 'stop',
			params: { args: { _: ['stop'] } },
		};

		// Send all three as a single concatenated chunk
		const combined =
			serializeMessage(msg1) + serializeMessage(msg2) + serializeMessage(msg3);
		clientStream.push(combined);

		expect(received).toHaveLength(3);
		expect(received[0].id).toBe(1);
		expect(received[1].id).toBe(2);
		expect(received[2].id).toBe(3);
	});

	it('handles split buffers (message split across data events)', () => {
		const received: ProtocolMessage[] = [];
		connection.onMessage((msg) => received.push(msg));

		const fullMessage = serializeMessage({
			id: 42,
			method: 'run',
			params: { args: { _: ['type', 'e3', 'hello'] } },
		} as CommandMessage);

		// Split the message at an arbitrary point
		const splitIndex = Math.floor(fullMessage.length / 2);
		const firstHalf = fullMessage.slice(0, splitIndex);
		const secondHalf = fullMessage.slice(splitIndex);

		clientStream.push(firstHalf);
		expect(received).toHaveLength(0); // Not yet complete

		clientStream.push(secondHalf);
		expect(received).toHaveLength(1);
		expect(received[0].id).toBe(42);
	});

	it('handles split buffers across three chunks', () => {
		const received: ProtocolMessage[] = [];
		connection.onMessage((msg) => received.push(msg));

		const fullMessage = serializeMessage({
			id: 7,
			method: 'run',
			params: { args: { _: ['navigate', 'https://example.com'] } },
		} as CommandMessage);

		// Split into three chunks
		const third = Math.floor(fullMessage.length / 3);
		clientStream.push(fullMessage.slice(0, third));
		clientStream.push(fullMessage.slice(third, third * 2));
		clientStream.push(fullMessage.slice(third * 2));

		expect(received).toHaveLength(1);
		expect(received[0].id).toBe(7);
	});

	it('handles mixed complete and partial messages', () => {
		const received: ProtocolMessage[] = [];
		connection.onMessage((msg) => received.push(msg));

		const msg1 = serializeMessage({
			id: 1,
			result: { success: true },
		} as ResponseMessage);
		const msg2 = serializeMessage({
			id: 2,
			error: 'not found',
		} as ErrorMessage);

		// First chunk: complete msg1 + partial msg2
		const splitPoint = Math.floor(msg2.length / 2);
		clientStream.push(msg1 + msg2.slice(0, splitPoint));
		expect(received).toHaveLength(1);
		expect(received[0].id).toBe(1);

		// Second chunk: rest of msg2
		clientStream.push(msg2.slice(splitPoint));
		expect(received).toHaveLength(2);
		expect(received[1].id).toBe(2);
	});

	it('ignores empty lines between messages', () => {
		const received: ProtocolMessage[] = [];
		connection.onMessage((msg) => received.push(msg));

		const msg1 = serializeMessage({
			id: 1,
			result: { success: true },
		} as ResponseMessage);
		const msg2 = serializeMessage({
			id: 2,
			result: { success: false },
		} as ResponseMessage);

		// Push with extra newlines between messages
		clientStream.push(msg1 + '\n\n' + msg2);
		expect(received).toHaveLength(2);
	});

	it('sends a message through the stream', () => {
		const chunks: string[] = [];
		clientStream.on('data', (chunk: Buffer) => {
			chunks.push(chunk.toString('utf-8'));
		});

		const msg: ResponseMessage = {
			id: 1,
			result: { success: true, snapshot: '- heading "Test"' },
		};

		connection.send(msg);

		const combined = chunks.join('');
		expect(combined).toContain('"id":1');
		expect(combined.endsWith('\n')).toBe(true);
	});

	it('throws ConnectionError when sending on a closed connection', () => {
		connection.close();
		expect(() =>
			connection.send({
				id: 1,
				result: { success: true },
			} as ResponseMessage),
		).toThrow(ConnectionError);
	});

	it('fires close handler when stream closes', async () => {
		const closePromise = new Promise<void>((resolve) => {
			connection.onClose(resolve);
		});

		clientStream.destroy();
		await closePromise;
	});

	it('fires error handler on stream error', async () => {
		const errorPromise = new Promise<Error>((resolve) => {
			connection.onError(resolve);
		});

		clientStream.destroy(new Error('test stream error'));
		const err = await errorPromise;
		expect(err.message).toBe('test stream error');
	});

	it('fires error handler on invalid JSON in stream', () => {
		const errorFn = vi.fn();
		connection.onError(errorFn);

		clientStream.push('this is not json\n');
		expect(errorFn).toHaveBeenCalled();
	});

	it('reports isClosed correctly', () => {
		expect(connection.isClosed).toBe(false);
		connection.close();
		expect(connection.isClosed).toBe(true);
	});

	it('close is idempotent', () => {
		connection.close();
		connection.close(); // Should not throw
		expect(connection.isClosed).toBe(true);
	});

	it('closes connection when buffer exceeds max size', () => {
		const errorFn = vi.fn();
		connection.onError(errorFn);

		// Push a very large chunk without any newlines
		const hugeChunk = 'x'.repeat(11 * 1024 * 1024); // 11 MB, exceeds 10 MB limit
		clientStream.push(hugeChunk);

		expect(errorFn).toHaveBeenCalled();
		expect(errorFn.mock.calls[0][0].message).toContain('Buffer exceeded maximum size');
		expect(connection.isClosed).toBe(true);
	});
});
