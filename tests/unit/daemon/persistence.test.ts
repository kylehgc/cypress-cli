import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import {
	saveSession,
	loadSession,
	listPersistedSessions,
	deletePersistedSession,
	resolveSessionsDir,
} from '../../../src/daemon/persistence.js';
import { Session } from '../../../src/daemon/session.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTempDir(): Promise<string> {
	return await fs.mkdtemp(path.join(os.tmpdir(), 'cypress-cli-persist-'));
}

// ---------------------------------------------------------------------------
// persistence
// ---------------------------------------------------------------------------

describe('persistence', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await makeTempDir();
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
	});

	describe('saveSession / loadSession', () => {
		it('persists and restores a session', async () => {
			const session = new Session({
				id: 'persist-test',
				url: 'http://localhost:3000',
			});
			session.recordHistory(
				{ id: 1, action: 'click', ref: 'e1' },
				{ success: true, snapshot: 'snap' },
			);

			await saveSession(session, tempDir);

			const loaded = await loadSession('persist-test', tempDir);
			expect(loaded).not.toBeNull();
			expect(loaded!.id).toBe('persist-test');
			expect(loaded!.config.url).toBe('http://localhost:3000');
			expect(loaded!.commandHistory).toHaveLength(1);
			expect(loaded!.commandHistory[0].command.action).toBe('click');
		});

		it('returns null for non-existent session', async () => {
			const loaded = await loadSession('nonexistent', tempDir);
			expect(loaded).toBeNull();
		});

		it('preserves history undo state', async () => {
			const session = new Session({ id: 'undo-test' });
			session.recordHistory(
				{ id: 1, action: 'click', ref: 'e1' },
				{ success: true },
			);
			session.recordHistory(
				{ id: 2, action: 'type', ref: 'e2' },
				{ success: true },
			);
			session.undoHistory();

			await saveSession(session, tempDir);

			const loaded = await loadSession('undo-test', tempDir);
			expect(loaded).not.toBeNull();
			expect(loaded!.history.undoIndex).toBe(1);
			expect(loaded!.history.activeSize).toBe(1);
			expect(loaded!.history.size).toBe(2);
		});

		it('creates sessions directory if it does not exist', async () => {
			const nestedDir = path.join(tempDir, 'a', 'b', 'c');
			const session = new Session({ id: 'nested-test' });

			await saveSession(session, nestedDir);

			const stat = await fs.stat(nestedDir);
			expect(stat.isDirectory()).toBe(true);
		});

		it('restored session starts in "waiting" state', async () => {
			const session = new Session({ id: 'state-test' });
			await saveSession(session, tempDir);

			const loaded = await loadSession('state-test', tempDir);
			expect(loaded!.state).toBe('waiting');
		});
	});

	describe('listPersistedSessions', () => {
		it('lists persisted sessions', async () => {
			const s1 = new Session({ id: 'alpha' });
			const s2 = new Session({ id: 'beta' });
			await saveSession(s1, tempDir);
			await saveSession(s2, tempDir);

			const ids = await listPersistedSessions(tempDir);
			expect(ids).toEqual(expect.arrayContaining(['alpha', 'beta']));
			expect(ids).toHaveLength(2);
		});

		it('returns empty array when directory does not exist', async () => {
			const ids = await listPersistedSessions(path.join(tempDir, 'nope'));
			expect(ids).toEqual([]);
		});
	});

	describe('deletePersistedSession', () => {
		it('deletes a persisted session', async () => {
			const session = new Session({ id: 'delete-test' });
			await saveSession(session, tempDir);

			const deleted = await deletePersistedSession('delete-test', tempDir);
			expect(deleted).toBe(true);

			const loaded = await loadSession('delete-test', tempDir);
			expect(loaded).toBeNull();
		});

		it('returns false for non-existent session', async () => {
			const deleted = await deletePersistedSession('nope', tempDir);
			expect(deleted).toBe(false);
		});
	});

	describe('session ID validation', () => {
		it('rejects session IDs with path separators', async () => {
			await expect(
				loadSession('../etc/passwd', tempDir),
			).rejects.toThrow('Invalid session ID');
		});

		it('rejects session IDs with backslash separators', async () => {
			await expect(
				loadSession('..\\etc\\passwd', tempDir),
			).rejects.toThrow('Invalid session ID');
		});

		it('rejects session IDs with dots only', async () => {
			await expect(loadSession('..', tempDir)).rejects.toThrow(
				'Invalid session ID',
			);
		});

		it('rejects empty session IDs', async () => {
			await expect(loadSession('', tempDir)).rejects.toThrow(
				'Invalid session ID',
			);
		});

		it('allows valid session IDs with hyphens and underscores', async () => {
			const loaded = await loadSession('my-session_01', tempDir);
			expect(loaded).toBeNull();
		});

		it('rejects path traversal in saveSession', async () => {
			const session = new Session({ id: '../traversal' });
			await expect(saveSession(session, tempDir)).rejects.toThrow(
				'Invalid session ID',
			);
		});

		it('rejects path traversal in deletePersistedSession', async () => {
			await expect(
				deletePersistedSession('../traversal', tempDir),
			).rejects.toThrow('Invalid session ID');
		});
	});

	describe('resolveSessionsDir', () => {
		it('uses XDG_STATE_HOME when set', () => {
			const original = process.env['XDG_STATE_HOME'];
			try {
				process.env['XDG_STATE_HOME'] = '/custom/state';
				const dir = resolveSessionsDir();
				expect(dir).toBe(path.join('/custom/state', 'cypress-cli', 'sessions'));
			} finally {
				if (original !== undefined) {
					process.env['XDG_STATE_HOME'] = original;
				} else {
					delete process.env['XDG_STATE_HOME'];
				}
			}
		});

		it('falls back to $HOME/.local/state when XDG_STATE_HOME is unset', () => {
			const original = process.env['XDG_STATE_HOME'];
			try {
				delete process.env['XDG_STATE_HOME'];
				const dir = resolveSessionsDir();
				const home = os.homedir();
				expect(dir).toBe(
					path.join(home, '.local', 'state', 'cypress-cli', 'sessions'),
				);
			} finally {
				if (original !== undefined) {
					process.env['XDG_STATE_HOME'] = original;
				} else {
					delete process.env['XDG_STATE_HOME'];
				}
			}
		});
	});
});
