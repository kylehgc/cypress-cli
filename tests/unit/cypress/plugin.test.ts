import { describe, it, expect, beforeEach, vi } from 'vitest';

import { CommandQueue, type QueuedCommand } from '../../../src/daemon/commandQueue.js';
import {
	registerTasks,
	createSetupNodeEvents,
	type CypressOnFn,
} from '../../../src/cypress/plugin.js';

describe('registerTasks', () => {
	let queue: CommandQueue;
	let registeredTasks: Record<string, (...args: unknown[]) => unknown>;
	let onFn: CypressOnFn;

	beforeEach(() => {
		queue = new CommandQueue();
		registeredTasks = {};

		// Mock the Cypress `on` function to capture task registrations
		onFn = vi.fn((event: string, tasks: Record<string, (...args: unknown[]) => unknown>) => {
			if (event === 'task') {
				Object.assign(registeredTasks, tasks);
			}
		});
	});

	it('calls on("task", ...) with getCommand and commandResult handlers', () => {
		registerTasks(onFn, queue);

		expect(onFn).toHaveBeenCalledTimes(1);
		expect(onFn).toHaveBeenCalledWith('task', expect.objectContaining({
			getCommand: expect.any(Function),
			commandResult: expect.any(Function),
		}));
	});

	it('registers a getCommand handler that returns commands from the queue', async () => {
		registerTasks(onFn, queue);

		const command: QueuedCommand = { id: 1, action: 'click', ref: 'e5' };
		queue.enqueue(command);

		const result = await (registeredTasks.getCommand as () => Promise<unknown>)();
		expect(result).toEqual(command);
	});

	it('registers a getCommand handler that returns poll sentinel on timeout', async () => {
		registerTasks(onFn, queue, { pollTimeout: 50 });

		const result = await (registeredTasks.getCommand as () => Promise<unknown>)();
		expect(result).toEqual({ type: 'poll' });
	});

	it('registers a getCommand handler that returns stop sentinel when disposed', async () => {
		registerTasks(onFn, queue);
		queue.dispose();

		const result = await (registeredTasks.getCommand as () => Promise<unknown>)();
		expect(result).toEqual({ type: 'stop' });
	});

	it('registers a commandResult handler that reports results', async () => {
		registerTasks(onFn, queue);

		const command: QueuedCommand = { id: 1, action: 'click', ref: 'e5' };
		const resultPromise = queue.enqueue(command);
		await queue.dequeue();

		const ack = (registeredTasks.commandResult as (r: unknown) => boolean)({
			success: true,
			snapshot: '- button "OK"',
		});

		expect(ack).toBe(true);

		const result = await resultPromise;
		expect(result.success).toBe(true);
		expect(result.snapshot).toBe('- button "OK"');
	});

	it('returns the created task handlers', () => {
		const handlers = registerTasks(onFn, queue);

		expect(typeof handlers.getCommand).toBe('function');
		expect(typeof handlers.commandResult).toBe('function');
	});

	it('uses custom pollTimeout when provided', async () => {
		registerTasks(onFn, queue, { pollTimeout: 30 });

		const start = Date.now();
		const result = await (registeredTasks.getCommand as () => Promise<unknown>)();
		const elapsed = Date.now() - start;

		expect(result).toEqual({ type: 'poll' });
		// Should have timed out quickly (around 30ms, allow margin)
		expect(elapsed).toBeLessThan(500);
	});
});

describe('createSetupNodeEvents', () => {
	let queue: CommandQueue;

	beforeEach(() => {
		queue = new CommandQueue();
	});

	it('returns a function', () => {
		const setup = createSetupNodeEvents(queue);
		expect(typeof setup).toBe('function');
	});

	it('registers tasks when the returned function is called', () => {
		const setup = createSetupNodeEvents(queue);
		const onFn = vi.fn();

		setup(onFn, {});

		expect(onFn).toHaveBeenCalledTimes(1);
		expect(onFn).toHaveBeenCalledWith('task', expect.objectContaining({
			getCommand: expect.any(Function),
			commandResult: expect.any(Function),
		}));
	});

	it('passes plugin options through to registerTasks', async () => {
		const setup = createSetupNodeEvents(queue, { pollTimeout: 30 });
		const registeredTasks: Record<string, (...args: unknown[]) => unknown> = {};
		const onFn: CypressOnFn = (_event, tasks) => {
			Object.assign(registeredTasks, tasks);
		};

		setup(onFn, {});

		const start = Date.now();
		const result = await (registeredTasks.getCommand as () => Promise<unknown>)();
		const elapsed = Date.now() - start;

		expect(result).toEqual({ type: 'poll' });
		expect(elapsed).toBeLessThan(500);
	});

	it('full round-trip: enqueue command, getCommand returns it, commandResult reports back', async () => {
		const setup = createSetupNodeEvents(queue, { pollTimeout: 5000 });
		const registeredTasks: Record<string, (...args: unknown[]) => unknown> = {};
		const onFn: CypressOnFn = (_event, tasks) => {
			Object.assign(registeredTasks, tasks);
		};

		setup(onFn, {});

		// Enqueue a command from the daemon side
		const command: QueuedCommand = { id: 1, action: 'type', ref: 'e3', text: 'hello' };
		const resultPromise = queue.enqueue(command);

		// Cypress side: getCommand picks it up
		const cmd = await (registeredTasks.getCommand as () => Promise<unknown>)();
		expect(cmd).toEqual(command);

		// Cypress side: commandResult reports back
		(registeredTasks.commandResult as (r: unknown) => boolean)({
			success: true,
			snapshot: '- textbox "Email" [ref=e3]: hello',
		});

		// Daemon side: enqueue Promise resolves with the result
		const result = await resultPromise;
		expect(result.success).toBe(true);
		expect(result.snapshot).toBe('- textbox "Email" [ref=e3]: hello');
	});
});
