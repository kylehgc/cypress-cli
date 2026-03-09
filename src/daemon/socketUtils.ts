import net from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { DaemonError } from './errors.js';

const SOCKET_DIR_NAME = 'cypress-cli';

/**
 * Resolve the directory for daemon socket files.
 */
export function resolveSocketDir(): string {
	const runtime = process.env['XDG_RUNTIME_DIR'];
	if (runtime) {
		return path.join(runtime, SOCKET_DIR_NAME);
	}
	const tmpdir = process.env['TMPDIR'] || os.tmpdir();
	return path.join(tmpdir, SOCKET_DIR_NAME);
}

/**
 * Check whether a daemon is listening on the given socket path.
 */
export function isSocketAlive(socketPath: string): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		const client = net.createConnection(socketPath);
		client.on('connect', () => {
			client.destroy();
			resolve(true);
		});
		client.on('error', () => {
			resolve(false);
		});
	});
}

/**
 * Remove a socket file if present.
 */
export async function removeSocketFile(socketPath: string): Promise<void> {
	try {
		await fs.unlink(socketPath);
	} catch (err) {
		const nodeErr = err as NodeJS.ErrnoException;
		if (nodeErr.code === 'ENOENT') {
			return;
		}
		throw err;
	}
}

/**
 * Ensure the socket path is free before the daemon binds to it.
 */
export async function ensureSocketAvailable(socketPath: string): Promise<void> {
	try {
		await fs.access(socketPath);
		const alive = await isSocketAlive(socketPath);
		if (alive) {
			throw new DaemonError(
				`Another daemon is already listening on ${socketPath}. ` +
					'Stop it first with `cypress-cli stop`.',
			);
		}
		await fs.unlink(socketPath);
	} catch (err) {
		if (err instanceof DaemonError) {
			throw err;
		}
		const nodeErr = err as NodeJS.ErrnoException;
		if (nodeErr.code === 'ENOENT') {
			return;
		}
		throw err;
	}
}

/**
 * Remove stale socket files from the socket directory.
 */
export async function cleanStaleSockets(socketDir?: string): Promise<string[]> {
	const dir = socketDir ?? resolveSocketDir();
	const cleaned: string[] = [];
	try {
		const entries = await fs.readdir(dir);
		for (const entry of entries) {
			if (!entry.endsWith('.sock')) continue;
			const socketPath = path.join(dir, entry);
			const alive = await isSocketAlive(socketPath);
			if (!alive) {
				try {
					await fs.unlink(socketPath);
					cleaned.push(entry.replace(/\.sock$/, ''));
				} catch {
					// Best-effort — ignore errors on individual files
				}
			}
		}
		return cleaned;
	} catch {
		return cleaned;
	}
}
