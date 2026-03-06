/**
 * Command history management with undo pointer.
 *
 * CommandHistory is an append-only log of executed commands. Each entry
 * records the command, its result, and a timestamp. An undo pointer tracks
 * which entries are "active" for export — undo moves the pointer back,
 * and new commands appended after an undo discard any undone entries.
 *
 * Serialization/deserialization supports session persistence across
 * daemon restarts.
 */

import type { QueuedCommand, CommandResult } from './commandQueue.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single entry in the command history log.
 */
export interface HistoryEntry {
	/** The command that was executed */
	command: QueuedCommand;
	/** The result returned by Cypress */
	result: CommandResult;
	/** Timestamp (ms since epoch) when the command completed */
	executedAt: number;
	/** Zero-based index in the history log */
	index: number;
}

/**
 * Serialized form of the command history, suitable for JSON persistence.
 */
export interface SerializedHistory {
	entries: HistoryEntry[];
	undoIndex: number;
}

// ---------------------------------------------------------------------------
// CommandHistory class
// ---------------------------------------------------------------------------

/**
 * Append-only command history with undo pointer.
 *
 * The undo pointer (`_undoIndex`) always points one past the last active
 * entry. When equal to `_entries.length`, all entries are active.
 * Calling `undo()` decrements it; appending a new entry after an undo
 * truncates the log at the pointer position before appending.
 */
export class CommandHistory {
	private _entries: HistoryEntry[] = [];
	private _undoIndex: number = 0;

	/**
	 * Append a completed command to the history.
	 *
	 * If the undo pointer is behind the end (i.e. some entries were undone),
	 * the undone entries are discarded before appending.
	 *
	 * @param command - The command that was executed
	 * @param result - The result from Cypress
	 * @returns The newly created history entry
	 */
	append(command: QueuedCommand, result: CommandResult): HistoryEntry {
		// Truncate any undone entries
		if (this._undoIndex < this._entries.length) {
			this._entries.length = this._undoIndex;
		}

		const entry: HistoryEntry = {
			command,
			result,
			executedAt: Date.now(),
			index: this._entries.length,
		};

		this._entries.push(entry);
		this._undoIndex = this._entries.length;
		return entry;
	}

	/**
	 * Undo the last active command by moving the undo pointer back.
	 *
	 * @returns The entry that was undone, or null if nothing to undo
	 */
	undo(): HistoryEntry | null {
		if (this._undoIndex <= 0) {
			return null;
		}
		this._undoIndex--;
		return this._entries[this._undoIndex];
	}

	/**
	 * Redo the last undone command by moving the undo pointer forward.
	 *
	 * @returns The entry that was redone, or null if nothing to redo
	 */
	redo(): HistoryEntry | null {
		if (this._undoIndex >= this._entries.length) {
			return null;
		}
		const entry = this._entries[this._undoIndex];
		this._undoIndex++;
		return entry;
	}

	/**
	 * All entries in the history (including undone entries).
	 */
	get entries(): ReadonlyArray<HistoryEntry> {
		return this._entries.slice();
	}

	/**
	 * Only the active (non-undone) entries.
	 */
	get activeEntries(): ReadonlyArray<HistoryEntry> {
		return this._entries.slice(0, this._undoIndex);
	}

	/**
	 * Total number of entries (including undone).
	 */
	get size(): number {
		return this._entries.length;
	}

	/**
	 * Number of active (non-undone) entries.
	 */
	get activeSize(): number {
		return this._undoIndex;
	}

	/**
	 * Whether there are entries that can be undone.
	 */
	get canUndo(): boolean {
		return this._undoIndex > 0;
	}

	/**
	 * Whether there are entries that can be redone.
	 */
	get canRedo(): boolean {
		return this._undoIndex < this._entries.length;
	}

	/**
	 * Current undo pointer position (one past last active entry).
	 */
	get undoIndex(): number {
		return this._undoIndex;
	}

	/**
	 * Get an entry by index.
	 *
	 * @param index - Zero-based index
	 * @returns The entry, or undefined if out of bounds
	 */
	get(index: number): HistoryEntry | undefined {
		return this._entries[index];
	}

	/**
	 * Clear all entries and reset the undo pointer.
	 */
	clear(): void {
		this._entries = [];
		this._undoIndex = 0;
	}

	/**
	 * Serialize the history to a plain object for JSON persistence.
	 */
	serialize(): SerializedHistory {
		return {
			entries: this._entries.slice(),
			undoIndex: this._undoIndex,
		};
	}

	/**
	 * Restore history from a serialized form.
	 *
	 * @param data - The serialized history object
	 * @returns A new CommandHistory instance with restored state
	 */
	static deserialize(data: SerializedHistory): CommandHistory {
		const history = new CommandHistory();
		history._entries = data.entries.map((entry, i) => ({
			...entry,
			index: i,
		}));
		history._undoIndex = Math.min(
			Math.max(0, data.undoIndex),
			history._entries.length,
		);
		return history;
	}
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Error thrown when a history operation is invalid.
 */
export class HistoryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'HistoryError';
	}
}
