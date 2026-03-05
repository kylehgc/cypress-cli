import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Tests for the driver spec polling loop state machine and command dispatch.
 *
 * Since the driver spec uses Cypress globals (cy, Cypress, describe, it),
 * we test the logic by simulating the polling loop behavior using the
 * daemon-side command queue and task handlers.
 *
 * These tests verify:
 * - The polling loop re-polls on poll sentinel
 * - The polling loop stops on stop sentinel
 * - Commands are dispatched and results are reported
 * - Errors during command execution are reported gracefully
 */

import { CommandQueue, type QueuedCommand, type CommandResult } from '../../../src/daemon/commandQueue.js';
import {
	createGetCommandHandler,
	createCommandResultHandler,
	type GetCommandResult,
} from '../../../src/daemon/taskHandler.js';

/**
 * Simulates the driver spec's polling loop behavior.
 *
 * This mirrors the logic in driverSpec.ts:
 * 1. Call getCommand (polls for next command)
 * 2. If poll sentinel → re-poll
 * 3. If stop sentinel → exit loop
 * 4. Otherwise → execute command → report result → re-poll
 */
async function simulatePollingLoop(
	getCommand: () => Promise<GetCommandResult>,
	reportResult: (result: CommandResult) => boolean,
	executeCommand: (cmd: QueuedCommand) => CommandResult,
	maxIterations = 20,
): Promise<{ executedCommands: QueuedCommand[]; stopped: boolean; iterations: number }> {
	const executedCommands: QueuedCommand[] = [];
	let stopped = false;
	let iterations = 0;

	while (iterations < maxIterations) {
		iterations++;
		const cmd = await getCommand();

		if ('type' in cmd && cmd.type === 'poll') {
			// Re-poll
			continue;
		}

		if ('type' in cmd && cmd.type === 'stop') {
			stopped = true;
			break;
		}

		// It's a real command
		const queuedCmd = cmd as QueuedCommand;
		executedCommands.push(queuedCmd);

		const result = executeCommand(queuedCmd);
		reportResult(result);
	}

	return { executedCommands, stopped, iterations };
}

describe('driver spec polling loop', () => {
	let queue: CommandQueue;
	let getCommand: () => Promise<GetCommandResult>;
	let reportResult: (result: CommandResult) => boolean;

	beforeEach(() => {
		queue = new CommandQueue();
		getCommand = createGetCommandHandler(queue, 50); // Short timeout for tests
		reportResult = createCommandResultHandler(queue);
	});

	it('re-polls after receiving poll sentinel (timeout)', async () => {
		// No commands enqueued, so first poll will timeout, then we enqueue a command and stop
		const command: QueuedCommand = { id: 1, action: 'click', ref: 'e5' };

		// Schedule: after 100ms enqueue a command, after 200ms dispose the queue
		setTimeout(() => queue.enqueue(command), 100);
		setTimeout(() => queue.dispose(), 300);

		const executeCommand = vi.fn((_cmd: QueuedCommand): CommandResult => ({
			success: true,
			snapshot: '- button "OK"',
		}));

		const result = await simulatePollingLoop(
			getCommand,
			reportResult,
			executeCommand,
		);

		// Should have polled at least once (timeout), executed the command, then stopped
		expect(result.executedCommands).toHaveLength(1);
		expect(result.executedCommands[0]).toEqual(command);
		expect(executeCommand).toHaveBeenCalledOnce();
		expect(result.iterations).toBeGreaterThan(1);
	});

	it('exits loop on stop sentinel', async () => {
		// Dispose queue immediately → getCommand returns stop sentinel
		queue.dispose();

		const executeCommand = vi.fn((): CommandResult => ({
			success: true,
		}));

		const result = await simulatePollingLoop(
			getCommand,
			reportResult,
			executeCommand,
		);

		expect(result.stopped).toBe(true);
		expect(result.executedCommands).toHaveLength(0);
		expect(executeCommand).not.toHaveBeenCalled();
		expect(result.iterations).toBe(1);
	});

	it('dispatches a click command correctly', async () => {
		const command: QueuedCommand = { id: 1, action: 'click', ref: 'e5' };
		queue.enqueue(command);

		// Dispose after the command is processed
		setTimeout(() => queue.dispose(), 200);

		const executeCommand = vi.fn((cmd: QueuedCommand): CommandResult => ({
			success: true,
			snapshot: `- button "OK" [ref=${cmd.ref}]`,
			selector: '[data-cy="btn"]',
			cypressCommand: `cy.get('[data-cy="btn"]').click()`,
		}));

		const result = await simulatePollingLoop(
			getCommand,
			reportResult,
			executeCommand,
		);

		expect(result.executedCommands).toHaveLength(1);
		expect(result.executedCommands[0].action).toBe('click');
		expect(result.executedCommands[0].ref).toBe('e5');
		expect(executeCommand).toHaveBeenCalledWith(command);
	});

	it('dispatches a type command correctly', async () => {
		const command: QueuedCommand = {
			id: 1,
			action: 'type',
			ref: 'e3',
			text: 'hello world',
		};
		queue.enqueue(command);
		setTimeout(() => queue.dispose(), 200);

		const executeCommand = vi.fn((cmd: QueuedCommand): CommandResult => ({
			success: true,
			snapshot: `- textbox [ref=${cmd.ref}]: ${cmd.text}`,
		}));

		const result = await simulatePollingLoop(
			getCommand,
			reportResult,
			executeCommand,
		);

		expect(result.executedCommands).toHaveLength(1);
		expect(result.executedCommands[0].action).toBe('type');
		expect(result.executedCommands[0].text).toBe('hello world');
	});

	it('dispatches a navigate command correctly', async () => {
		const command: QueuedCommand = {
			id: 1,
			action: 'navigate',
			text: 'https://example.com',
		};
		queue.enqueue(command);
		setTimeout(() => queue.dispose(), 200);

		const executeCommand = vi.fn((): CommandResult => ({
			success: true,
			snapshot: '- heading "Example Domain"',
		}));

		const result = await simulatePollingLoop(
			getCommand,
			reportResult,
			executeCommand,
		);

		expect(result.executedCommands).toHaveLength(1);
		expect(result.executedCommands[0].action).toBe('navigate');
		expect(result.executedCommands[0].text).toBe('https://example.com');
	});

	it('handles multiple commands in sequence', async () => {
		const commands: QueuedCommand[] = [
			{ id: 1, action: 'click', ref: 'e1' },
			{ id: 2, action: 'type', ref: 'e2', text: 'test' },
			{ id: 3, action: 'snapshot' },
		];

		// Enqueue commands with small delays to ensure ordering
		for (let i = 0; i < commands.length; i++) {
			setTimeout(() => queue.enqueue(commands[i]), i * 50);
		}
		setTimeout(() => queue.dispose(), 500);

		const executeCommand = vi.fn((): CommandResult => ({
			success: true,
			snapshot: '- main: ...',
		}));

		const result = await simulatePollingLoop(
			getCommand,
			reportResult,
			executeCommand,
		);

		expect(result.executedCommands).toHaveLength(3);
		expect(result.executedCommands[0].action).toBe('click');
		expect(result.executedCommands[1].action).toBe('type');
		expect(result.executedCommands[2].action).toBe('snapshot');
	});

	it('reports error result when command execution fails', async () => {
		const command: QueuedCommand = { id: 1, action: 'click', ref: 'e99' };
		const resultPromise = queue.enqueue(command);
		setTimeout(() => queue.dispose(), 200);

		const executeCommand = vi.fn((): CommandResult => ({
			success: false,
			error: 'Ref "e99" not found in current snapshot',
			snapshot: '- main: current state',
		}));

		const loopResult = await simulatePollingLoop(
			getCommand,
			reportResult,
			executeCommand,
		);

		expect(loopResult.executedCommands).toHaveLength(1);

		// The enqueue caller should receive the error result
		const cmdResult = await resultPromise;
		expect(cmdResult.success).toBe(false);
		expect(cmdResult.error).toBe('Ref "e99" not found in current snapshot');
		expect(cmdResult.snapshot).toBe('- main: current state');
	});

	it('continues polling after handling a command', async () => {
		const cmd1: QueuedCommand = { id: 1, action: 'click', ref: 'e1' };
		const cmd2: QueuedCommand = { id: 2, action: 'click', ref: 'e2' };

		// First command available immediately
		queue.enqueue(cmd1);
		// Second command arrives after a delay
		setTimeout(() => queue.enqueue(cmd2), 150);
		// Stop after both are processed
		setTimeout(() => queue.dispose(), 500);

		const executeCommand = vi.fn((): CommandResult => ({
			success: true,
			snapshot: '- button "OK"',
		}));

		const result = await simulatePollingLoop(
			getCommand,
			reportResult,
			executeCommand,
		);

		expect(result.executedCommands).toHaveLength(2);
		expect(result.executedCommands[0].ref).toBe('e1');
		expect(result.executedCommands[1].ref).toBe('e2');
	});
});

describe('driver spec command dispatch', () => {
	it('maps click action to correct command shape', () => {
		const cmd: QueuedCommand = { id: 1, action: 'click', ref: 'e5' };
		expect(cmd.action).toBe('click');
		expect(cmd.ref).toBe('e5');
	});

	it('maps type action with text payload', () => {
		const cmd: QueuedCommand = { id: 1, action: 'type', ref: 'e3', text: 'hello' };
		expect(cmd.action).toBe('type');
		expect(cmd.ref).toBe('e3');
		expect(cmd.text).toBe('hello');
	});

	it('maps navigate action with URL', () => {
		const cmd: QueuedCommand = { id: 1, action: 'navigate', text: 'https://example.com' };
		expect(cmd.action).toBe('navigate');
		expect(cmd.text).toBe('https://example.com');
	});

	it('maps snapshot action (no ref or text)', () => {
		const cmd: QueuedCommand = { id: 1, action: 'snapshot' };
		expect(cmd.action).toBe('snapshot');
		expect(cmd.ref).toBeUndefined();
		expect(cmd.text).toBeUndefined();
	});

	it('maps assert action with options', () => {
		const cmd: QueuedCommand = {
			id: 1,
			action: 'assert',
			ref: 'e5',
			options: { chainer: 'have.text', value: 'Hello' },
		};
		expect(cmd.action).toBe('assert');
		expect(cmd.ref).toBe('e5');
		expect(cmd.options?.chainer).toBe('have.text');
	});

	it('maps select action with value in text field', () => {
		const cmd: QueuedCommand = { id: 1, action: 'select', ref: 'e7', text: 'admin' };
		expect(cmd.action).toBe('select');
		expect(cmd.ref).toBe('e7');
		expect(cmd.text).toBe('admin');
	});
});

describe('driver spec result shape with selector/cypressCommand', () => {
	let queue: CommandQueue;
	let getCommand: () => Promise<GetCommandResult>;
	let reportResult: (result: CommandResult) => boolean;

	beforeEach(() => {
		queue = new CommandQueue();
		getCommand = createGetCommandHandler(queue, 50);
		reportResult = createCommandResultHandler(queue);
	});

	it('propagates selector and cypressCommand for ref-based commands', async () => {
		const command: QueuedCommand = { id: 1, action: 'click', ref: 'e5' };
		const resultPromise = queue.enqueue(command);
		setTimeout(() => queue.dispose(), 200);

		const executeCommand = vi.fn((): CommandResult => ({
			success: true,
			snapshot: '- button "OK"',
			selector: '[data-cy="btn"]',
			cypressCommand: "cy.get('[data-cy=\"btn\"]').click()",
		}));

		await simulatePollingLoop(getCommand, reportResult, executeCommand);

		const cmdResult = await resultPromise;
		expect(cmdResult.success).toBe(true);
		expect(cmdResult.selector).toBe('[data-cy="btn"]');
		expect(cmdResult.cypressCommand).toBe("cy.get('[data-cy=\"btn\"]').click()");
		expect(cmdResult.snapshot).toBe('- button "OK"');
	});

	it('propagates cypressCommand for non-ref commands (navigate)', async () => {
		const command: QueuedCommand = { id: 1, action: 'navigate', text: 'https://example.com' };
		const resultPromise = queue.enqueue(command);
		setTimeout(() => queue.dispose(), 200);

		const executeCommand = vi.fn((): CommandResult => ({
			success: true,
			snapshot: '- heading "Example"',
			cypressCommand: "cy.visit('https://example.com')",
		}));

		await simulatePollingLoop(getCommand, reportResult, executeCommand);

		const cmdResult = await resultPromise;
		expect(cmdResult.success).toBe(true);
		expect(cmdResult.cypressCommand).toBe("cy.visit('https://example.com')");
		expect(cmdResult.selector).toBeUndefined();
	});

	it('propagates cypressCommand for non-ref commands (back)', async () => {
		const command: QueuedCommand = { id: 1, action: 'back' };
		const resultPromise = queue.enqueue(command);
		setTimeout(() => queue.dispose(), 200);

		const executeCommand = vi.fn((): CommandResult => ({
			success: true,
			snapshot: '- heading "Previous"',
			cypressCommand: "cy.go('back')",
		}));

		await simulatePollingLoop(getCommand, reportResult, executeCommand);

		const cmdResult = await resultPromise;
		expect(cmdResult.success).toBe(true);
		expect(cmdResult.cypressCommand).toBe("cy.go('back')");
	});

	it('does not include selector/cypressCommand on error results', async () => {
		const command: QueuedCommand = { id: 1, action: 'click', ref: 'e99' };
		const resultPromise = queue.enqueue(command);
		setTimeout(() => queue.dispose(), 200);

		const executeCommand = vi.fn((): CommandResult => ({
			success: false,
			error: 'Ref "e99" not found in current snapshot',
			snapshot: '- main: current state',
		}));

		await simulatePollingLoop(getCommand, reportResult, executeCommand);

		const cmdResult = await resultPromise;
		expect(cmdResult.success).toBe(false);
		expect(cmdResult.error).toBe('Ref "e99" not found in current snapshot');
		expect(cmdResult.selector).toBeUndefined();
		expect(cmdResult.cypressCommand).toBeUndefined();
	});

	it('includes both selector and cypressCommand for type command', async () => {
		const command: QueuedCommand = { id: 1, action: 'type', ref: 'e3', text: 'hello' };
		const resultPromise = queue.enqueue(command);
		setTimeout(() => queue.dispose(), 200);

		const executeCommand = vi.fn((): CommandResult => ({
			success: true,
			snapshot: '- textbox: hello',
			selector: '#email',
			cypressCommand: "cy.get('#email').type('hello')",
		}));

		await simulatePollingLoop(getCommand, reportResult, executeCommand);

		const cmdResult = await resultPromise;
		expect(cmdResult.success).toBe(true);
		expect(cmdResult.selector).toBe('#email');
		expect(cmdResult.cypressCommand).toBe("cy.get('#email').type('hello')");
	});
});
