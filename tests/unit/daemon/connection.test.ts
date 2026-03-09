import { describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';

import {
ConnectionError,
SocketConnection,
} from '../../../src/daemon/connection.js';
import {
serializeMessage,
type CommandMessage,
type ResponseMessage,
} from '../../../src/daemon/protocol.js';

describe('SocketConnection', () => {
it('parses framed messages and reassembles chunked payloads', () => {
const stream = new PassThrough();
const connection = new SocketConnection(stream);
const received: number[] = [];
connection.onMessage((message) => received.push(message.id));

const first: CommandMessage = {
id: 1,
method: 'run',
params: { args: { _: ['snapshot'] } },
};
const second: CommandMessage = {
id: 2,
method: 'run',
params: { args: { _: ['type', 'e1', 'hello'] } },
};

const secondSerialized = serializeMessage(second);
const splitAt = Math.floor(secondSerialized.length / 2);

stream.push(serializeMessage(first) + secondSerialized.slice(0, splitAt));
expect(received).toEqual([1]);

stream.push(secondSerialized.slice(splitAt));
expect(received).toEqual([1, 2]);
});

it('handles UTF-8 split across chunks and emits callbacks', async () => {
const stream = new PassThrough();
const connection = new SocketConnection(stream);
const onMessage = vi.fn();
const onError = vi.fn();
connection.onMessage(onMessage);
connection.onError(onError);

const message: ResponseMessage = {
id: 11,
result: { success: true, snapshot: 'emoji 😀' },
};
const bytes = Buffer.from(serializeMessage(message), 'utf-8');
const splitIndex = bytes.indexOf(Buffer.from('😀')) + 1;
stream.push(bytes.subarray(0, splitIndex));
stream.push(bytes.subarray(splitIndex));

expect(onMessage).toHaveBeenCalledTimes(1);
expect(onMessage.mock.calls[0][0].id).toBe(11);
expect(onError).not.toHaveBeenCalled();

const closed = new Promise<void>((resolve) => {
connection.onClose(resolve);
});
stream.destroy();
await closed;
expect(connection.isClosed).toBe(true);
});

it('serializes send(), closes cleanly, and rejects oversized buffers', () => {
const stream = new PassThrough();
const connection = new SocketConnection(stream);

const writes: string[] = [];
stream.on('data', (chunk: Buffer | string) => {
writes.push(typeof chunk === 'string' ? chunk : chunk.toString('utf-8'));
});

connection.send({ id: 7, result: { success: true } });
expect(writes.join('')).toContain('"id":7');

const onError = vi.fn();
connection.onError(onError);
stream.push('x'.repeat(11 * 1024 * 1024));
expect(onError).toHaveBeenCalled();
expect(onError.mock.calls[0][0]).toBeInstanceOf(ConnectionError);
expect(connection.isClosed).toBe(true);

expect(() => connection.send({ id: 8, result: { success: true } })).toThrow(
ConnectionError,
);
connection.close();
});
});
