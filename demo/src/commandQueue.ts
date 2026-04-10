/**
 * Simple async FIFO queue for the browser demo.
 *
 * The demo runs entirely in one tab, but commands still need serialized
 * execution so typing, navigation, and snapshot generation cannot overlap.
 */

/**
 * Async task queued by the demo REPL.
 */
export type QueueTask<T> = () => Promise<T>;

/**
 * Promise-backed FIFO queue that runs one task at a time.
 */
export class CommandQueue {
	private _tail: Promise<void> = Promise.resolve();

	/**
	 * Enqueue a task and run it after all prior tasks finish.
	 *
	 * @param task - The async task to execute serially
	 * @returns The task result once it reaches the front of the queue
	 */
	enqueue<T>(task: QueueTask<T>): Promise<T> {
		const runTask = this._tail.then(task, task);
		this._tail = runTask.then(
			() => undefined,
			() => undefined,
		);
		return runTask;
	}

	/**
	 * Reset the queue chain. Useful when the demo is torn down and rebuilt.
	 */
	clear(): void {
		this._tail = Promise.resolve();
	}
}