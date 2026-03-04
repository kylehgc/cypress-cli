import { describe, it, expect, beforeEach } from 'vitest';

import {
	CommandQueue,
	QueueError,
	type QueuedCommand,
	type CommandResult,
} from '../../../src/daemon/commandQueue.js';

describe('CommandQueue', () => {
	let queue: CommandQueue;

	beforeEach(() => {
		queue = new CommandQueue();
	});

	// -----------------------------------------------------------------------
	// enqueue and dequeue
	// -----------------------------------------------------------------------

	describe('enqueue and dequeue', () => {
		it('enqueues and dequeues a single command', async () => {
			const command: QueuedCommand = { id: 1, action: 'click', ref: 'e5' };

			// Enqueue — won't resolve until reportResult is called
			const resultPromise = queue.enqueue(command);

			// Dequeue should return the command
			const dequeued = await queue.dequeue();
			expect(dequeued).toEqual(command);

			// Report result to resolve the enqueue promise
			const result: CommandResult = {
				success: true,
				snapshot: '- button "OK"',
			};
			queue.reportResult(result);

			const received = await resultPromise;
			expect(received).toEqual(result);
		});

		it('dequeues block until a command is enqueued', async () => {
			let resolved = false;

			// Start dequeue — it should block
			const dequeuePromise = queue.dequeue().then((cmd) => {
				resolved = true;
				return cmd;
			});

			// Not resolved yet
			await Promise.resolve(); // tick
			expect(resolved).toBe(false);

			// Now enqueue a command
			const command: QueuedCommand = { id: 1, action: 'snapshot' };
			queue.enqueue(command);

			// Should resolve now
			const dequeued = await dequeuePromise;
			expect(resolved).toBe(true);
			expect(dequeued).toEqual(command);
		});

		it('commands are FIFO', async () => {
			const cmdA: QueuedCommand = { id: 1, action: 'click', ref: 'e1' };
			const cmdB: QueuedCommand = {
				id: 2,
				action: 'type',
				ref: 'e2',
				text: 'hello',
			};
			const cmdC: QueuedCommand = { id: 3, action: 'snapshot' };

			// Enqueue all three
			const promiseA = queue.enqueue(cmdA);
			const promiseB = queue.enqueue(cmdB);
			const promiseC = queue.enqueue(cmdC);

			// Dequeue and verify order
			const first = await queue.dequeue();
			expect(first).toEqual(cmdA);
			queue.reportResult({ success: true });
			await promiseA;

			const second = await queue.dequeue();
			expect(second).toEqual(cmdB);
			queue.reportResult({ success: true });
			await promiseB;

			const third = await queue.dequeue();
			expect(third).toEqual(cmdC);
			queue.reportResult({ success: true });
			await promiseC;
		});

		it('delivers immediately when consumer is already waiting', async () => {
			// Start waiting first
			const dequeuePromise = queue.dequeue();

			// Then enqueue — should deliver immediately to the waiter
			const command: QueuedCommand = { id: 1, action: 'click', ref: 'e5' };
			queue.enqueue(command);

			const dequeued = await dequeuePromise;
			expect(dequeued).toEqual(command);
		});
	});

	// -----------------------------------------------------------------------
	// concurrent dequeues
	// -----------------------------------------------------------------------

	describe('concurrent dequeues', () => {
		it('throws error on concurrent dequeue calls', async () => {
			// First dequeue is fine (blocks waiting for a command)
			queue.dequeue();

			// Second dequeue should throw
			expect(() => queue.dequeue()).toThrow(QueueError);
			expect(() => queue.dequeue()).toThrow(
				'another dequeue is already pending',
			);
		});

		it('throws error when dequeuing while a command is in-flight', async () => {
			const command: QueuedCommand = { id: 1, action: 'click', ref: 'e1' };
			queue.enqueue(command);
			await queue.dequeue();

			// Command is now in-flight — should not allow another dequeue
			expect(() => queue.dequeue()).toThrow(QueueError);
			expect(() => queue.dequeue()).toThrow('already in-flight');
		});
	});

	// -----------------------------------------------------------------------
	// reportResult
	// -----------------------------------------------------------------------

	describe('reportResult', () => {
		it('resolves the enqueue Promise with the result', async () => {
			const command: QueuedCommand = { id: 1, action: 'click', ref: 'e3' };
			const resultPromise = queue.enqueue(command);

			await queue.dequeue();

			const result: CommandResult = {
				success: true,
				snapshot: '- heading "Welcome"',
				selector: '[data-cy="title"]',
				cypressCommand: 'cy.get(\'[data-cy="title"]\').click()',
			};
			queue.reportResult(result);

			const received = await resultPromise;
			expect(received.success).toBe(true);
			expect(received.snapshot).toBe('- heading "Welcome"');
			expect(received.selector).toBe('[data-cy="title"]');
			expect(received.cypressCommand).toBe(
				'cy.get(\'[data-cy="title"]\').click()',
			);
		});

		it('throws when no command is in-flight', () => {
			expect(() => queue.reportResult({ success: true })).toThrow(QueueError);
			expect(() => queue.reportResult({ success: true })).toThrow(
				'no command is currently in-flight',
			);
		});
	});

	// -----------------------------------------------------------------------
	// dequeueWithTimeout
	// -----------------------------------------------------------------------

	describe('dequeueWithTimeout', () => {
		it('returns command immediately when one is queued', async () => {
			const command: QueuedCommand = { id: 1, action: 'click', ref: 'e5' };
			queue.enqueue(command);

			const result = await queue.dequeueWithTimeout(5000);
			expect(result).toEqual(command);
		});

		it('returns null when timeout elapses with no command', async () => {
			const result = await queue.dequeueWithTimeout(50);
			expect(result).toBeNull();
		});

		it('clears waiter after timeout', async () => {
			await queue.dequeueWithTimeout(50);
			expect(queue.hasWaiter).toBe(false);
		});

		it('delivers command that arrives before timeout', async () => {
			const promise = queue.dequeueWithTimeout(5000);
			const command: QueuedCommand = { id: 1, action: 'snapshot' };
			queue.enqueue(command);
			const result = await promise;
			expect(result).toEqual(command);
		});

		it('returns null when disposed during wait', async () => {
			const promise = queue.dequeueWithTimeout(5000);
			queue.dispose();
			const result = await promise;
			expect(result).toBeNull();
		});

		it('throws when queue is disposed', () => {
			queue.dispose();
			expect(() => queue.dequeueWithTimeout(1000)).toThrow(QueueError);
		});

		it('throws when another dequeue is pending', () => {
			queue.dequeue(); // blocking dequeue
			expect(() => queue.dequeueWithTimeout(1000)).toThrow(QueueError);
		});

		it('throws when a command is in-flight', async () => {
			queue.enqueue({ id: 1, action: 'click', ref: 'e1' });
			await queue.dequeue();
			expect(() => queue.dequeueWithTimeout(1000)).toThrow(QueueError);
		});
	});

	// -----------------------------------------------------------------------
	// disposal
	// -----------------------------------------------------------------------

	describe('dispose', () => {
		it('prevents enqueue after disposal', () => {
			queue.dispose();
			expect(() =>
				queue.enqueue({ id: 1, action: 'click', ref: 'e1' }),
			).toThrow(QueueError);
			expect(() =>
				queue.enqueue({ id: 1, action: 'click', ref: 'e1' }),
			).toThrow('disposed');
		});

		it('prevents dequeue after disposal', () => {
			queue.dispose();
			expect(() => queue.dequeue()).toThrow(QueueError);
			expect(() => queue.dequeue()).toThrow('disposed');
		});

		it('sets isDisposed to true', () => {
			expect(queue.isDisposed).toBe(false);
			queue.dispose();
			expect(queue.isDisposed).toBe(true);
		});

		it('clears pending commands on disposal', async () => {
			const p1 = queue.enqueue({ id: 1, action: 'click', ref: 'e1' });
			const p2 = queue.enqueue({ id: 2, action: 'click', ref: 'e2' });
			expect(queue.size).toBe(2);

			queue.dispose();
			expect(queue.size).toBe(0);

			// Catch the rejections to avoid unhandled rejection errors
			await expect(p1).rejects.toThrow(QueueError);
			await expect(p2).rejects.toThrow(QueueError);
		});

		it('rejects pending enqueue Promises on disposal', async () => {
			const resultPromise = queue.enqueue({
				id: 1,
				action: 'click',
				ref: 'e1',
			});

			queue.dispose();

			await expect(resultPromise).rejects.toThrow(QueueError);
			await expect(resultPromise).rejects.toThrow('disposed');
		});

		it('rejects in-flight enqueue Promise on disposal', async () => {
			const resultPromise = queue.enqueue({
				id: 1,
				action: 'click',
				ref: 'e1',
			});
			await queue.dequeue();

			queue.dispose();

			await expect(resultPromise).rejects.toThrow(QueueError);
			await expect(resultPromise).rejects.toThrow('disposed');
		});

		it('rejects pending waiter dequeue on disposal', async () => {
			const dequeuePromise = queue.dequeue();

			queue.dispose();

			await expect(dequeuePromise).rejects.toThrow(QueueError);
		});
	});

	// -----------------------------------------------------------------------
	// state accessors
	// -----------------------------------------------------------------------

	describe('state accessors', () => {
		it('tracks queue size', () => {
			expect(queue.size).toBe(0);

			queue.enqueue({ id: 1, action: 'click', ref: 'e1' });
			expect(queue.size).toBe(1);

			queue.enqueue({ id: 2, action: 'type', ref: 'e2', text: 'hi' });
			expect(queue.size).toBe(2);
		});

		it('tracks inflight status', async () => {
			expect(queue.hasInflight).toBe(false);

			queue.enqueue({ id: 1, action: 'click', ref: 'e1' });
			await queue.dequeue();
			expect(queue.hasInflight).toBe(true);

			queue.reportResult({ success: true });
			expect(queue.hasInflight).toBe(false);
		});

		it('tracks waiter status', async () => {
			expect(queue.hasWaiter).toBe(false);

			// Start a dequeue that will block
			queue.dequeue();
			expect(queue.hasWaiter).toBe(true);

			// Enqueue delivers to waiter
			queue.enqueue({ id: 1, action: 'snapshot' });
			// Waiter should be cleared after delivery
			await Promise.resolve(); // tick
			expect(queue.hasWaiter).toBe(false);
		});
	});
});
