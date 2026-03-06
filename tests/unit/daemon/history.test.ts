import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import {
	CommandHistory,
	type SerializedHistory,
} from '../../../src/daemon/history.js';
import type {
	QueuedCommand,
	CommandResult,
} from '../../../src/daemon/commandQueue.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCommand(id: number, action: string, ref?: string): QueuedCommand {
	return { id, action, ...(ref !== undefined && { ref }) };
}

function makeResult(success: boolean, snapshot?: string): CommandResult {
	return { success, ...(snapshot !== undefined && { snapshot }) };
}

// ---------------------------------------------------------------------------
// CommandHistory
// ---------------------------------------------------------------------------

describe('CommandHistory', () => {
	let history: CommandHistory;

	beforeEach(() => {
		history = new CommandHistory();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// -----------------------------------------------------------------------
	// Append
	// -----------------------------------------------------------------------

	describe('append', () => {
		it('appends entries with correct index and timestamp', () => {
			vi.setSystemTime(1000);
			const entry = history.append(
				makeCommand(1, 'click', 'e1'),
				makeResult(true, 'snap1'),
			);

			expect(entry.index).toBe(0);
			expect(entry.executedAt).toBe(1000);
			expect(entry.command.action).toBe('click');
			expect(entry.result.success).toBe(true);
		});

		it('appends multiple entries in order', () => {
			history.append(makeCommand(1, 'click', 'e1'), makeResult(true));
			history.append(makeCommand(2, 'type', 'e2'), makeResult(true));
			history.append(makeCommand(3, 'navigate'), makeResult(true));

			expect(history.size).toBe(3);
			expect(history.entries[0].command.action).toBe('click');
			expect(history.entries[1].command.action).toBe('type');
			expect(history.entries[2].command.action).toBe('navigate');
		});

		it('sets sequential indices', () => {
			history.append(makeCommand(1, 'click', 'e1'), makeResult(true));
			history.append(makeCommand(2, 'type', 'e2'), makeResult(true));

			expect(history.entries[0].index).toBe(0);
			expect(history.entries[1].index).toBe(1);
		});

		it('truncates undone entries when appending after undo', () => {
			history.append(makeCommand(1, 'click', 'e1'), makeResult(true));
			history.append(makeCommand(2, 'type', 'e2'), makeResult(true));
			history.append(makeCommand(3, 'clear', 'e3'), makeResult(true));

			history.undo(); // undo clear
			history.undo(); // undo type

			// Append new entry — should truncate type and clear
			history.append(makeCommand(4, 'check', 'e4'), makeResult(true));

			expect(history.size).toBe(2);
			expect(history.entries[0].command.action).toBe('click');
			expect(history.entries[1].command.action).toBe('check');
		});
	});

	// -----------------------------------------------------------------------
	// Undo
	// -----------------------------------------------------------------------

	describe('undo', () => {
		it('returns null when history is empty', () => {
			expect(history.undo()).toBeNull();
		});

		it('returns the last entry when undoing', () => {
			history.append(makeCommand(1, 'click', 'e1'), makeResult(true));
			history.append(makeCommand(2, 'type', 'e2'), makeResult(true));

			const undone = history.undo();
			expect(undone).not.toBeNull();
			expect(undone!.command.action).toBe('type');
		});

		it('moves undo pointer back', () => {
			history.append(makeCommand(1, 'click', 'e1'), makeResult(true));
			history.append(makeCommand(2, 'type', 'e2'), makeResult(true));

			expect(history.undoIndex).toBe(2);
			history.undo();
			expect(history.undoIndex).toBe(1);
			history.undo();
			expect(history.undoIndex).toBe(0);
		});

		it('returns null after all entries are undone', () => {
			history.append(makeCommand(1, 'click', 'e1'), makeResult(true));

			history.undo();
			expect(history.undo()).toBeNull();
		});

		it('active entries shrink after undo', () => {
			history.append(makeCommand(1, 'click', 'e1'), makeResult(true));
			history.append(makeCommand(2, 'type', 'e2'), makeResult(true));

			expect(history.activeSize).toBe(2);
			history.undo();
			expect(history.activeSize).toBe(1);
			expect(history.activeEntries).toHaveLength(1);
			expect(history.activeEntries[0].command.action).toBe('click');
		});
	});

	// -----------------------------------------------------------------------
	// Redo
	// -----------------------------------------------------------------------

	describe('redo', () => {
		it('returns null when nothing to redo', () => {
			expect(history.redo()).toBeNull();
		});

		it('returns null when no undo has been done', () => {
			history.append(makeCommand(1, 'click', 'e1'), makeResult(true));
			expect(history.redo()).toBeNull();
		});

		it('redoes the last undone entry', () => {
			history.append(makeCommand(1, 'click', 'e1'), makeResult(true));
			history.append(makeCommand(2, 'type', 'e2'), makeResult(true));

			history.undo();
			const redone = history.redo();
			expect(redone).not.toBeNull();
			expect(redone!.command.action).toBe('type');
		});

		it('moves undo pointer forward', () => {
			history.append(makeCommand(1, 'click', 'e1'), makeResult(true));
			history.append(makeCommand(2, 'type', 'e2'), makeResult(true));

			history.undo();
			history.undo();
			expect(history.undoIndex).toBe(0);

			history.redo();
			expect(history.undoIndex).toBe(1);
			history.redo();
			expect(history.undoIndex).toBe(2);
		});

		it('returns null after all entries are redone', () => {
			history.append(makeCommand(1, 'click', 'e1'), makeResult(true));

			history.undo();
			history.redo();
			expect(history.redo()).toBeNull();
		});
	});

	// -----------------------------------------------------------------------
	// Undo/redo interaction
	// -----------------------------------------------------------------------

	describe('undo/redo interaction', () => {
		it('redo is lost after append following undo', () => {
			history.append(makeCommand(1, 'click', 'e1'), makeResult(true));
			history.append(makeCommand(2, 'type', 'e2'), makeResult(true));

			history.undo();
			history.append(makeCommand(3, 'clear', 'e3'), makeResult(true));

			// redo should return null — the undone entry was truncated
			expect(history.redo()).toBeNull();
			expect(history.size).toBe(2);
		});

		it('multiple undo/redo cycles work correctly', () => {
			history.append(makeCommand(1, 'click', 'e1'), makeResult(true));
			history.append(makeCommand(2, 'type', 'e2'), makeResult(true));

			history.undo();
			history.redo();
			history.undo();
			history.undo();
			history.redo();

			expect(history.activeSize).toBe(1);
			expect(history.activeEntries[0].command.action).toBe('click');
		});
	});

	// -----------------------------------------------------------------------
	// Accessors
	// -----------------------------------------------------------------------

	describe('accessors', () => {
		it('reports canUndo/canRedo correctly', () => {
			expect(history.canUndo).toBe(false);
			expect(history.canRedo).toBe(false);

			history.append(makeCommand(1, 'click', 'e1'), makeResult(true));
			expect(history.canUndo).toBe(true);
			expect(history.canRedo).toBe(false);

			history.undo();
			expect(history.canUndo).toBe(false);
			expect(history.canRedo).toBe(true);
		});

		it('get returns entry by index', () => {
			history.append(makeCommand(1, 'click', 'e1'), makeResult(true));
			history.append(makeCommand(2, 'type', 'e2'), makeResult(true));

			const entry = history.get(0);
			expect(entry).toBeDefined();
			expect(entry!.command.action).toBe('click');

			expect(history.get(99)).toBeUndefined();
		});

		it('entries returns a copy', () => {
			history.append(makeCommand(1, 'click', 'e1'), makeResult(true));

			const entries1 = history.entries;
			const entries2 = history.entries;
			expect(entries1).not.toBe(entries2);
			expect(entries1).toEqual(entries2);
		});
	});

	// -----------------------------------------------------------------------
	// Clear
	// -----------------------------------------------------------------------

	describe('clear', () => {
		it('resets all entries and undo pointer', () => {
			history.append(makeCommand(1, 'click', 'e1'), makeResult(true));
			history.append(makeCommand(2, 'type', 'e2'), makeResult(true));

			history.clear();
			expect(history.size).toBe(0);
			expect(history.activeSize).toBe(0);
			expect(history.undoIndex).toBe(0);
			expect(history.canUndo).toBe(false);
		});
	});

	// -----------------------------------------------------------------------
	// Serialization / deserialization
	// -----------------------------------------------------------------------

	describe('serialization', () => {
		it('serializes empty history', () => {
			const data = history.serialize();
			expect(data.entries).toEqual([]);
			expect(data.undoIndex).toBe(0);
		});

		it('serializes entries and undo index', () => {
			vi.setSystemTime(5000);
			history.append(makeCommand(1, 'click', 'e1'), makeResult(true, 'snap'));
			vi.setSystemTime(6000);
			history.append(makeCommand(2, 'type', 'e2'), makeResult(true));

			const data = history.serialize();
			expect(data.entries).toHaveLength(2);
			expect(data.entries[0].executedAt).toBe(5000);
			expect(data.entries[1].executedAt).toBe(6000);
			expect(data.undoIndex).toBe(2);
		});

		it('serializes with undo pointer behind', () => {
			history.append(makeCommand(1, 'click', 'e1'), makeResult(true));
			history.append(makeCommand(2, 'type', 'e2'), makeResult(true));
			history.undo();

			const data = history.serialize();
			expect(data.entries).toHaveLength(2);
			expect(data.undoIndex).toBe(1);
		});

		it('deserializes to restore history', () => {
			vi.setSystemTime(5000);
			history.append(makeCommand(1, 'click', 'e1'), makeResult(true, 'snap'));
			vi.setSystemTime(6000);
			history.append(makeCommand(2, 'type', 'e2'), makeResult(true));

			const data = history.serialize();
			const restored = CommandHistory.deserialize(data);

			expect(restored.size).toBe(2);
			expect(restored.undoIndex).toBe(2);
			expect(restored.entries[0].command.action).toBe('click');
			expect(restored.entries[0].executedAt).toBe(5000);
			expect(restored.entries[1].command.action).toBe('type');
		});

		it('deserializes preserves undo pointer position', () => {
			history.append(makeCommand(1, 'click', 'e1'), makeResult(true));
			history.append(makeCommand(2, 'type', 'e2'), makeResult(true));
			history.undo();

			const restored = CommandHistory.deserialize(history.serialize());
			expect(restored.undoIndex).toBe(1);
			expect(restored.activeSize).toBe(1);
			expect(restored.canRedo).toBe(true);
		});

		it('round-trips through JSON', () => {
			vi.setSystemTime(5000);
			history.append(makeCommand(1, 'click', 'e1'), makeResult(true, 'snap'));
			history.undo();

			const json = JSON.stringify(history.serialize());
			const parsed = JSON.parse(json) as SerializedHistory;
			const restored = CommandHistory.deserialize(parsed);

			expect(restored.size).toBe(1);
			expect(restored.undoIndex).toBe(0);
			expect(restored.canRedo).toBe(true);
		});

		it('clamps invalid undo index during deserialization', () => {
			const data: SerializedHistory = {
				entries: [
					{
						command: makeCommand(1, 'click', 'e1'),
						result: makeResult(true),
						executedAt: 5000,
						index: 0,
					},
				],
				undoIndex: 999,
			};

			const restored = CommandHistory.deserialize(data);
			expect(restored.undoIndex).toBe(1); // clamped to entries.length
		});

		it('clamps negative undo index during deserialization', () => {
			const data: SerializedHistory = {
				entries: [
					{
						command: makeCommand(1, 'click', 'e1'),
						result: makeResult(true),
						executedAt: 5000,
						index: 0,
					},
				],
				undoIndex: -5,
			};

			const restored = CommandHistory.deserialize(data);
			expect(restored.undoIndex).toBe(0); // clamped to 0
		});

		it('re-indexes entries during deserialization', () => {
			const data: SerializedHistory = {
				entries: [
					{
						command: makeCommand(1, 'click', 'e1'),
						result: makeResult(true),
						executedAt: 5000,
						index: 99, // wrong index
					},
					{
						command: makeCommand(2, 'type', 'e2'),
						result: makeResult(true),
						executedAt: 6000,
						index: 42, // wrong index
					},
				],
				undoIndex: 2,
			};

			const restored = CommandHistory.deserialize(data);
			expect(restored.entries[0].index).toBe(0);
			expect(restored.entries[1].index).toBe(1);
		});
	});
});
