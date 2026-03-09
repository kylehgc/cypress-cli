import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import net from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { QueueBridge } from '../../../src/cypress/queueBridge.js';
import type { CommandQueue } from '../../../src/daemon/commandQueue.js';

const taskMocks = vi.hoisted(() => ({
getCommand: vi.fn(),
commandResult: vi.fn(),
createTaskHandlers: vi.fn(),
}));

vi.mock('../../../src/daemon/taskHandler.js', () => ({
createTaskHandlers: taskMocks.createTaskHandlers,
}));

async function sendBridgeMessage(
socketPath: string,
payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
return await new Promise((resolve, reject) => {
const socket = net.createConnection(socketPath);
let buffer = '';

socket.on('connect', () => {
socket.write(`${JSON.stringify(payload)}\n`);
});

socket.on('data', (chunk) => {
buffer += chunk.toString('utf-8');
const newlineIndex = buffer.indexOf('\n');
if (newlineIndex === -1) return;
const line = buffer.slice(0, newlineIndex);
socket.destroy();
resolve(JSON.parse(line) as Record<string, unknown>);
});

socket.on('error', reject);
});
}

describe('QueueBridge', () => {
let socketDir: string;
let socketPath: string;
let bridge: QueueBridge;

beforeEach(async () => {
socketDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cypress-cli-bridge-'));
socketPath = path.join(socketDir, `bridge-${Date.now()}-${Math.random()}.sock`);

taskMocks.getCommand.mockReset();
taskMocks.commandResult.mockReset();
taskMocks.createTaskHandlers.mockReset().mockReturnValue({
getCommand: taskMocks.getCommand,
commandResult: taskMocks.commandResult,
});

bridge = new QueueBridge(socketPath, {} as CommandQueue, 100);
});

afterEach(async () => {
await bridge.stop();
await fs.rm(socketDir, { recursive: true, force: true });
});

it('start() listens on a socket and stop() cleans it up', async () => {
await bridge.start();
await expect(fs.access(socketPath)).resolves.toBeUndefined();
await bridge.stop();
await expect(fs.access(socketPath)).rejects.toThrow();
});

it('handles getCommand requests from Cypress', async () => {
taskMocks.getCommand.mockResolvedValue({ id: 1, action: 'snapshot' });
await bridge.start();

const response = await sendBridgeMessage(socketPath, { type: 'getCommand' });
expect(taskMocks.getCommand).toHaveBeenCalledTimes(1);
expect(response).toEqual({
type: 'getCommand',
result: { id: 1, action: 'snapshot' },
});
});

it('forwards commandResult payloads and acknowledges', async () => {
taskMocks.commandResult.mockReturnValue(true);
await bridge.start();

const payload = {
success: true,
snapshot: '- button "Save"',
};
const response = await sendBridgeMessage(socketPath, {
type: 'commandResult',
payload,
});

expect(taskMocks.commandResult).toHaveBeenCalledWith(payload);
expect(response).toEqual({ type: 'commandResult', result: true });
});

it('handles Cypress disconnection and rapid sequential requests', async () => {
taskMocks.getCommand
.mockResolvedValueOnce({ id: 2, action: 'click', ref: 'e1' })
.mockResolvedValueOnce({ id: 3, action: 'type', ref: 'e2', text: 'hi' });
await bridge.start();

// Disconnected client should not crash bridge.
const disconnectedSocket = net.createConnection(socketPath);
disconnectedSocket.on('connect', () => disconnectedSocket.destroy());
await new Promise((resolve) => disconnectedSocket.on('close', resolve));

const [first, second] = await Promise.all([
sendBridgeMessage(socketPath, { type: 'getCommand' }),
sendBridgeMessage(socketPath, { type: 'getCommand' }),
]);

expect(taskMocks.getCommand).toHaveBeenCalledTimes(2);
expect([first, second]).toEqual(
expect.arrayContaining([
{ type: 'getCommand', result: { id: 2, action: 'click', ref: 'e1' } },
{
type: 'getCommand',
result: { id: 3, action: 'type', ref: 'e2', text: 'hi' },
},
]),
);
});
});
