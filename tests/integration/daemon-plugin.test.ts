/**
 * Integration test: Daemon ↔ Plugin (task handler) communication.
 *
 * Verifies the full bridge between the daemon's command queue and the
 * Cypress plugin task handlers (getCommand / commandResult), using real
 * queue instances but mocking the Cypress process.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { CommandQueue, type QueuedCommand } from '../../src/daemon/commandQueue.js';
import {
	createGetCommandHandler,
	createTaskHandlers,
} from '../../src/daemon/taskHandler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCommand(id: number, action: string, ref?: string): QueuedCommand {
	return { id, action, ...(ref !== undefined && { ref }) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Daemon ↔ Plugin integration', () => {
	let queue: CommandQueue;

	beforeEach(() => {
		queue = new CommandQueue();
	});

	// -----------------------------------------------------------------------
	// getCommand handler
	// -----------------------------------------------------------------------

	describe('getCommand handler', () => {
		it('returns queued command immediately when one is available', async () => {
			const getCommand = createGetCommandHandler(queue, 1000);

			// Enqueue a command before calling getCommand
			const enqueuePromise = queue.enqueue(makeCommand(1, 'click', 'e5'));

			const result = await getCommand();
			expect(result).toEqual({ id: 1, action: 'click', ref: 'e5' });

			// Report result to resolve the enqueue promise
			queue.reportResult({ success: true });
			await enqueuePromise;
		});

		it('waits for command and delivers when one arrives', async () => {
			const getCommand = createGetCommandHandler(queue, 5000);

			// Start getCommand before any command is queued
			const commandPromise = getCommand();

			// Give the handler a tick to set up the waiter
			await new Promise((r) => setTimeout(r, 10));

			// Now enqueue a command
			const enqueuePromise = queue.enqueue(makeCommand(2, 'type', 'e3'));

			const result = await commandPromise;
			expect(result).toEqual({ id: 2, action: 'type', ref: 'e3' });

			// Clean up: report result
			queue.reportResult({ success: true });
			await enqueuePromise;
		});

		it('returns poll sentinel on timeout when no command arrives', async () => {
			const getCommand = createGetCommandHandler(queue, 50); // Short timeout

			const result = await getCommand();
			expect(result).toEqual({ type: 'poll' });
		});

		it('returns stop sentinel when queue is disposed', async () => {
			const getCommand = createGetCommandHandler(queue, 5000);

			queue.dispose();

			const result = await getCommand();
			expect(result).toEqual({ type: 'stop' });
		});

		it('returns stop sentinel when queue is disposed while waiting', async () => {
			const getCommand = createGetCommandHandler(queue, 5000);

			// Start long-polling
			const commandPromise = getCommand();

			// Give it a tick then dispose
			await new Promise((r) => setTimeout(r, 10));
			queue.dispose();

			const result = await commandPromise;
			// After disposal during wait, dequeueWithTimeout resolves null
			// and the handler checks isDisposed → stop
			expect(result).toEqual({ type: 'stop' });
		});
	});

	// -----------------------------------------------------------------------
	// commandResult handler
	// -----------------------------------------------------------------------

	describe('commandResult handler', () => {
		it('delivers result back to the enqueue caller', async () => {
			const { getCommand, commandResult } = createTaskHandlers(queue, 5000);

			// Enqueue command
			const enqueuePromise = queue.enqueue(
				makeCommand(1, 'click', 'e5'),
			);

			// Plugin dequeues
			await getCommand();

			// Plugin reports result
			const ack = commandResult({
				success: true,
				snapshot: '- button "Submit"',
				selector: '[data-cy="submit"]',
			});
			expect(ack).toBe(true);

			// The enqueue caller receives the result
			const result = await enqueuePromise;
			expect(result.success).toBe(true);
			expect(result.snapshot).toBe('- button "Submit"');
			expect(result.selector).toBe('[data-cy="submit"]');
		});

		it('delivers error result back to the enqueue caller', async () => {
			const { getCommand, commandResult } = createTaskHandlers(queue, 5000);

			const enqueuePromise = queue.enqueue(
				makeCommand(1, 'click', 'e99'),
			);

			await getCommand();

			commandResult({
				success: false,
				error: 'Element ref e99 not found in current snapshot',
			});

			const result = await enqueuePromise;
			expect(result.success).toBe(false);
			expect(result.error).toBe(
				'Element ref e99 not found in current snapshot',
			);
		});

		it('returns true even if queue is disposed (graceful during shutdown)', async () => {
			const { commandResult } = createTaskHandlers(queue, 5000);

			// Dispose queue first — commandResult should not throw
			queue.dispose();
			const ack = commandResult({ success: true });
			expect(ack).toBe(true);
		});
	});

	// -----------------------------------------------------------------------
	// Full getCommand → commandResult round-trip
	// -----------------------------------------------------------------------

	describe('full round-trip', () => {
		it('enqueue → getCommand → commandResult → result received', async () => {
			const { getCommand, commandResult } = createTaskHandlers(queue, 5000);

			// CLI side enqueues
			const enqueuePromise = queue.enqueue(
				makeCommand(10, 'navigate', undefined),
			);

			// Plugin side dequeues
			const cmd = await getCommand();
			expect(cmd).toHaveProperty('action', 'navigate');

			// Plugin side reports result
			commandResult({
				success: true,
				snapshot: '- heading "Welcome"',
				cypressCommand: 'cy.visit("http://example.com")',
			});

			// CLI side receives result
			const result = await enqueuePromise;
			expect(result.success).toBe(true);
			expect(result.snapshot).toBe('- heading "Welcome"');
			expect(result.cypressCommand).toBe(
				'cy.visit("http://example.com")',
			);
		});

		it('handles sequential round-trips', async () => {
			const { getCommand, commandResult } = createTaskHandlers(queue, 5000);

			// Round-trip 1
			const p1 = queue.enqueue(makeCommand(1, 'click', 'e1'));
			const cmd1 = await getCommand();
			expect((cmd1 as QueuedCommand).id).toBe(1);
			commandResult({ success: true, snapshot: 'snap-1' });
			const r1 = await p1;
			expect(r1.snapshot).toBe('snap-1');

			// Round-trip 2
			const p2 = queue.enqueue(makeCommand(2, 'type', 'e2'));
			const cmd2 = await getCommand();
			expect((cmd2 as QueuedCommand).id).toBe(2);
			commandResult({ success: true, snapshot: 'snap-2' });
			const r2 = await p2;
			expect(r2.snapshot).toBe('snap-2');
		});

		it('handles poll sentinel then real command', async () => {
			const getCommand = createGetCommandHandler(queue, 50); // Short timeout

			// First call: no command → poll sentinel
			const sentinel = await getCommand();
			expect(sentinel).toEqual({ type: 'poll' });

			// Now enqueue and call again
			const enqueuePromise = queue.enqueue(
				makeCommand(5, 'snapshot'),
			);

			// Second call: command available
			const getCommand2 = createGetCommandHandler(queue, 5000);
			const cmd = await getCommand2();
			expect(cmd).toHaveProperty('action', 'snapshot');

			// Complete the round-trip
			queue.reportResult({ success: true, snapshot: 'full-tree' });
			const result = await enqueuePromise;
			expect(result.snapshot).toBe('full-tree');
		});
	});
});
