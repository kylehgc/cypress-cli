import { describe, it, expect, beforeEach } from 'vitest';

import {
	CommandQueue,
	type QueuedCommand,
} from '../../../src/daemon/commandQueue.js';
import {
	createGetCommandHandler,
	createCommandResultHandler,
	createTaskHandlers,
} from '../../../src/daemon/taskHandler.js';

describe('createGetCommandHandler', () => {
	let queue: CommandQueue;

	beforeEach(() => {
		queue = new CommandQueue();
	});

	it('returns a command when one is already queued', async () => {
		const command: QueuedCommand = { id: 1, action: 'click', ref: 'e5' };
		queue.enqueue(command);

		const handler = createGetCommandHandler(queue, 1000);
		const result = await handler();

		expect(result).toEqual(command);
	});

	it('returns poll sentinel when timeout elapses with no command', async () => {
		const handler = createGetCommandHandler(queue, 50);
		const result = await handler();

		expect(result).toEqual({ type: 'poll' });
	});

	it('returns stop sentinel when queue is disposed before call', async () => {
		queue.dispose();

		const handler = createGetCommandHandler(queue, 1000);
		const result = await handler();

		expect(result).toEqual({ type: 'stop' });
	});

	it('returns stop sentinel when queue is disposed during wait', async () => {
		const handler = createGetCommandHandler(queue, 5000);
		const resultPromise = handler();

		// Dispose the queue while waiting
		queue.dispose();

		const result = await resultPromise;
		// dequeueWithTimeout returns null on dispose, then isDisposed check -> stop
		expect(result).toEqual({ type: 'stop' });
	});

	it('delivers command that arrives before timeout', async () => {
		const handler = createGetCommandHandler(queue, 5000);
		const resultPromise = handler();

		// Enqueue a command after a brief delay
		const command: QueuedCommand = { id: 1, action: 'snapshot' };
		setTimeout(() => queue.enqueue(command), 10);

		const result = await resultPromise;
		expect(result).toEqual(command);
	});

	it('does not leave orphaned waiter after timeout', async () => {
		const handler = createGetCommandHandler(queue, 50);
		await handler();

		// After timeout, no waiter should be pending
		expect(queue.hasWaiter).toBe(false);
	});

	it('can re-poll after a timeout without error', async () => {
		const handler = createGetCommandHandler(queue, 50);

		// First poll times out
		const first = await handler();
		expect(first).toEqual({ type: 'poll' });

		// Second poll should work fine (no "another dequeue already pending" error)
		const command: QueuedCommand = { id: 1, action: 'click', ref: 'e1' };
		queue.enqueue(command);
		const second = await handler();
		expect(second).toEqual(command);
	});
});

describe('createCommandResultHandler', () => {
	let queue: CommandQueue;

	beforeEach(() => {
		queue = new CommandQueue();
	});

	it('forwards result to the queue and returns true', async () => {
		const command: QueuedCommand = { id: 1, action: 'click', ref: 'e5' };
		const resultPromise = queue.enqueue(command);
		await queue.dequeue();

		const handler = createCommandResultHandler(queue);
		const ack = handler({ success: true, snapshot: '- button "OK"' });

		expect(ack).toBe(true);

		const result = await resultPromise;
		expect(result.success).toBe(true);
		expect(result.snapshot).toBe('- button "OK"');
	});
});

describe('createTaskHandlers', () => {
	it('returns both handlers', () => {
		const queue = new CommandQueue();
		const handlers = createTaskHandlers(queue, 100);

		expect(typeof handlers.getCommand).toBe('function');
		expect(typeof handlers.commandResult).toBe('function');
	});

	it('handlers share the same queue', async () => {
		const queue = new CommandQueue();
		const handlers = createTaskHandlers(queue, 5000);

		// Enqueue a command and pick it up via getCommand
		const command: QueuedCommand = {
			id: 1,
			action: 'type',
			ref: 'e3',
			text: 'hello',
		};
		const resultPromise = queue.enqueue(command);

		const getResult = await handlers.getCommand();
		expect(getResult).toEqual(command);

		// Report result via commandResult
		handlers.commandResult({ success: true });
		const result = await resultPromise;
		expect(result.success).toBe(true);
	});
});
