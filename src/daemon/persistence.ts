/**
 * Session persistence: save and load session state to/from disk.
 *
 * Sessions are stored as JSON files under:
 *   $XDG_STATE_HOME/cypress-cli/sessions/<sessionId>.json
 *
 * Fallback paths:
 *   $HOME/.local/state/cypress-cli/sessions/<sessionId>.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { Session, type SerializedSession } from './session.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Subdirectory name for session persistence files.
 */
const SESSIONS_DIR_NAME = 'sessions';

/**
 * Application directory name under the state home.
 */
const APP_DIR_NAME = 'cypress-cli';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Pattern for valid session IDs: alphanumeric, hyphens, and underscores only.
 * Prevents path traversal via `../` or other special characters.
 */
const SAFE_SESSION_ID = /^[a-zA-Z0-9_-]+$/;

/**
 * Validate that a session ID is safe for use in file paths.
 *
 * @param sessionId - The session ID to validate
 * @throws {Error} If the session ID contains unsafe characters
 */
function validateSessionId(sessionId: string): void {
	if (!SAFE_SESSION_ID.test(sessionId)) {
		throw new Error(
			`Invalid session ID "${sessionId}": must contain only alphanumeric characters, hyphens, and underscores.`,
		);
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the directory for persisted session files.
 *
 * Prefers `$XDG_STATE_HOME/cypress-cli/sessions/`, falls back to
 * `$HOME/.local/state/cypress-cli/sessions/`.
 */
export function resolveSessionsDir(): string {
	const stateHome = process.env['XDG_STATE_HOME'];
	if (stateHome) {
		return path.join(stateHome, APP_DIR_NAME, SESSIONS_DIR_NAME);
	}
	const home = os.homedir();
	return path.join(home, '.local', 'state', APP_DIR_NAME, SESSIONS_DIR_NAME);
}

/**
 * Persist a session's state to disk.
 *
 * @param session - The session to persist
 * @param dir - Override the sessions directory (for testing)
 */
export async function saveSession(
	session: Session,
	dir?: string,
): Promise<void> {
	validateSessionId(session.id);
	const sessionsDir = dir ?? resolveSessionsDir();
	await fs.mkdir(sessionsDir, { recursive: true, mode: 0o700 });

	const filePath = path.join(sessionsDir, `${session.id}.json`);
	const data = session.serialize();
	await fs.writeFile(filePath, JSON.stringify(data, null, '\t'), 'utf-8');
}

/**
 * Load a persisted session from disk.
 *
 * @param sessionId - The session ID to load
 * @param dir - Override the sessions directory (for testing)
 * @returns The restored Session, or null if not found
 */
export async function loadSession(
	sessionId: string,
	dir?: string,
): Promise<Session | null> {
	validateSessionId(sessionId);
	const sessionsDir = dir ?? resolveSessionsDir();
	const filePath = path.join(sessionsDir, `${sessionId}.json`);

	try {
		const raw = await fs.readFile(filePath, 'utf-8');
		const data = JSON.parse(raw) as SerializedSession;
		return Session.deserialize(data);
	} catch (err) {
		const nodeErr = err as NodeJS.ErrnoException;
		if (nodeErr.code === 'ENOENT') {
			return null;
		}
		throw err;
	}
}

/**
 * List all persisted session IDs.
 *
 * @param dir - Override the sessions directory (for testing)
 * @returns Array of session IDs
 */
export async function listPersistedSessions(
	dir?: string,
): Promise<string[]> {
	const sessionsDir = dir ?? resolveSessionsDir();

	try {
		const files = await fs.readdir(sessionsDir);
		return files
			.filter((f) => f.endsWith('.json'))
			.map((f) => f.replace(/\.json$/, ''));
	} catch (err) {
		const nodeErr = err as NodeJS.ErrnoException;
		if (nodeErr.code === 'ENOENT') {
			return [];
		}
		throw err;
	}
}

/**
 * Delete a persisted session file.
 *
 * @param sessionId - The session ID to delete
 * @param dir - Override the sessions directory (for testing)
 * @returns True if the file was deleted, false if not found
 */
export async function deletePersistedSession(
	sessionId: string,
	dir?: string,
): Promise<boolean> {
	validateSessionId(sessionId);
	const sessionsDir = dir ?? resolveSessionsDir();
	const filePath = path.join(sessionsDir, `${sessionId}.json`);

	try {
		await fs.unlink(filePath);
		return true;
	} catch (err) {
		const nodeErr = err as NodeJS.ErrnoException;
		if (nodeErr.code === 'ENOENT') {
			return false;
		}
		throw err;
	}
}
