import type { DemoCommand, DemoCommandResult, SessionCommandRecord } from './commandExecutor.js';

/**
 * A recorded browser-demo command/result pair.
 */
export interface SessionHistoryEntry extends SessionCommandRecord {
	/** Timestamp captured when the command finished. */
	timestamp: number;
}

const history: SessionHistoryEntry[] = [];

/**
 * Record a completed command so export and history views stay in sync.
 *
 * @param command - The executed command
 * @param result - The command result
 */
export function recordCommand(
	command: DemoCommand,
	result: DemoCommandResult,
): void {
	history.push({
		command,
		result,
		timestamp: Date.now(),
	});
}

/**
 * Return a copy of the current command history.
 */
export function getHistory(): SessionHistoryEntry[] {
	return history.map((entry) => ({
		...entry,
		command: {
			...entry.command,
			...(entry.command.options ? { options: { ...entry.command.options } } : {}),
		},
		result: {
			...entry.result,
		},
	}));
}

/**
 * Remove and return the most recent history entry.
 */
export function undo(): SessionHistoryEntry | undefined {
	return history.pop();
}

/**
 * Clear all recorded history entries.
 */
export function clearHistory(): void {
	history.length = 0;
}