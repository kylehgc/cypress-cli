import { beforeEach, describe, expect, it, vi } from 'vitest';

const fsMocks = vi.hoisted(() => ({ access: vi.fn() }));
const daemonMocks = vi.hoisted(() => ({ resolveSocketDir: vi.fn() }));
const socketMocks = vi.hoisted(() => ({
sendAndReceive: vi.fn(),
ClientConnectionError: class ClientConnectionError extends Error {
constructor(message: string) {
super(message);
this.name = 'ClientConnectionError';
}
},
}));

vi.mock('node:fs/promises', () => ({
default: { access: fsMocks.access },
access: fsMocks.access,
}));

vi.mock('../../../src/daemon/daemon.js', () => ({
resolveSocketDir: daemonMocks.resolveSocketDir,
}));

vi.mock('../../../src/client/socketConnection.js', () => ({
sendAndReceive: socketMocks.sendAndReceive,
ClientConnectionError: socketMocks.ClientConnectionError,
}));

import { ClientSession } from '../../../src/client/session.js';
import type { ParsedCommand } from '../../../src/client/command.js';

describe('ClientSession', () => {
beforeEach(() => {
vi.clearAllMocks();
daemonMocks.resolveSocketDir.mockReturnValue('/tmp/cypress-cli-sockets');
fsMocks.access.mockResolvedValue(undefined);
socketMocks.sendAndReceive.mockResolvedValue({
id: 1,
result: { success: true, snapshot: '- document' },
});
});

it('resolveSocketPath() returns explicit socketPath without discovery', async () => {
const session = new ClientSession({ socketPath: '/tmp/direct.sock' });
await expect(session.resolveSocketPath()).resolves.toBe('/tmp/direct.sock');
expect(fsMocks.access).not.toHaveBeenCalled();
});

it('resolveSocketPath() discovers session socket and errors when missing', async () => {
const session = new ClientSession({ session: 'alpha' });
await expect(session.resolveSocketPath()).resolves.toBe(
'/tmp/cypress-cli-sockets/alpha.sock',
);

fsMocks.access.mockRejectedValueOnce(new Error('ENOENT'));
const missingSession = new ClientSession({ session: 'missing' });
await expect(missingSession.resolveSocketPath()).rejects.toThrow(
'No session "missing" found.',
);
});

it('sendCommand() serializes wire args, increments IDs, and correlates responses', async () => {
const session = new ClientSession({
session: 'demo',
responseTimeout: 321,
connectTimeout: 654,
});
const click: ParsedCommand = {
command: 'click',
args: { ref: 'e10' },
options: { timeout: 1000 },
};
const type: ParsedCommand = {
command: 'type',
args: { ref: 'e20', text: 'hello world' },
options: {},
};

await session.sendCommand(click);
await session.sendCommand(type);

expect(socketMocks.sendAndReceive).toHaveBeenNthCalledWith(
1,
{
id: 1,
method: 'run',
params: {
args: {
_: ['click', 'e10'],
timeout: 1000,
},
},
},
{
socketPath: '/tmp/cypress-cli-sockets/demo.sock',
responseTimeout: 321,
connectTimeout: 654,
},
);

expect(socketMocks.sendAndReceive).toHaveBeenNthCalledWith(
2,
expect.objectContaining({
id: 2,
method: 'run',
params: {
args: {
_: ['type', 'e20', 'hello world'],
},
},
}),
expect.any(Object),
);
});

it('sendCommand() uses stop method and propagates transport errors', async () => {
const session = new ClientSession({ session: 'demo' });
const stopCommand: ParsedCommand = {
command: 'stop',
args: {},
options: {},
};

await session.sendCommand(stopCommand);
expect(socketMocks.sendAndReceive).toHaveBeenCalledWith(
expect.objectContaining({ method: 'stop', params: { args: { _: ['stop'] } } }),
expect.any(Object),
);

socketMocks.sendAndReceive.mockRejectedValueOnce(new Error('daemon unavailable'));
await expect(session.sendCommand(stopCommand)).rejects.toThrow('daemon unavailable');
});
});
