import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ParsedCommand } from './command.js';
import { ClientSession, DEFAULT_SESSION, type ClientResult } from './session.js';
import { ClientConnectionError } from './socketConnection.js';

const DEFAULT_STARTUP_TIMEOUT_MS = 60_000;
const STARTUP_POLL_INTERVAL_MS = 250;

/**
 * Minimal client surface needed by the open helper.
 */
export interface SessionClient {
	sendCommand(parsedCommand: ParsedCommand): Promise<ClientResult>;
}

/**
 * Injectable dependencies for testing the open helper.
 */
export interface OpenCommandDependencies {
	createSession?: (sessionName: string) => SessionClient;
	spawnProcess?: typeof spawn;
	sleep?: (ms: number) => Promise<void>;
	startupTimeoutMs?: number;
}

/**
 * Resolve the session name that `open` should target.
 *
 * `--resume` implies the session name because persisted sessions are keyed by ID.
 */
export function resolveOpenSessionName(
	parsedCommand: ParsedCommand,
	sessionName?: string,
): string {
	const requestedResume =
		typeof parsedCommand.options['resume'] === 'string'
			? parsedCommand.options['resume']
			: undefined;

	if (requestedResume) {
		if (sessionName && sessionName !== requestedResume) {
			throw new Error(
				`Cannot combine --session "${sessionName}" with --resume "${requestedResume}". Use the same value for both, or omit --session.`,
			);
		}
		return requestedResume;
	}

	return sessionName ?? DEFAULT_SESSION;
}

/**
 * Build the daemon child-process argv for an `open` command.
 */
export function buildOpenDaemonArgs(
	sessionName: string,
	parsedCommand: ParsedCommand,
): string[] {
	const args = [getDaemonEntryPath(), '--session', sessionName];
	const url =
		typeof parsedCommand.args['url'] === 'string'
			? parsedCommand.args['url']
			: undefined;
	const browser =
		typeof parsedCommand.options['browser'] === 'string'
			? parsedCommand.options['browser']
			: undefined;
	const config =
		typeof parsedCommand.options['config'] === 'string'
			? parsedCommand.options['config']
			: undefined;
	const resume =
		typeof parsedCommand.options['resume'] === 'string'
			? parsedCommand.options['resume']
			: undefined;
	const headed = parsedCommand.options['headed'] === true;

	if (url) {
		args.push('--url', url);
	}
	if (browser) {
		args.push('--browser', browser);
	}
	if (headed) {
		args.push('--headed');
	}
	if (config) {
		args.push('--config', config);
	}
	if (resume) {
		args.push('--resume', resume);
	}

	return args;
}

/**
 * Handle the `open` command on the client side.
 *
 * If a session is already running, `open` reuses it and optionally navigates to
 * the requested URL. Otherwise, it starts a background daemon process and waits
 * until the session is ready to accept commands.
 */
export async function openSession(
	parsedCommand: ParsedCommand,
	sessionName?: string,
	dependencies: OpenCommandDependencies = {},
): Promise<ClientResult> {
	const resolvedSessionName = resolveOpenSessionName(parsedCommand, sessionName);
	const session =
		dependencies.createSession?.(resolvedSessionName) ??
		new ClientSession({ session: resolvedSessionName });
	const requestedResume = typeof parsedCommand.options['resume'] === 'string';

	if (!requestedResume) {
		const existingResult = await tryReuseOpenSession(session, parsedCommand);
		if (existingResult) {
			return existingResult;
		}
	}

	const spawnProcess = dependencies.spawnProcess ?? spawn;
	const child = spawnProcess(
		process.execPath,
		buildOpenDaemonArgs(resolvedSessionName, parsedCommand),
		{
			detached: true,
			stdio: 'ignore',
		},
	);
	child.unref();

	return waitForSessionReady(
		session,
		resolvedSessionName,
		child,
		dependencies.sleep ?? defaultSleep,
		dependencies.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS,
	);
}

async function tryReuseOpenSession(
	session: SessionClient,
	parsedCommand: ParsedCommand,
): Promise<ClientResult | null> {
	const requestedUrl =
		typeof parsedCommand.args['url'] === 'string'
			? parsedCommand.args['url']
			: undefined;

	const command = requestedUrl
		? {
				command: 'navigate',
				args: { url: requestedUrl },
				options: {},
			}
		: {
				command: 'snapshot',
				args: {},
				options: {},
			};

	try {
		return await session.sendCommand(command);
	} catch (err) {
		if (err instanceof ClientConnectionError) {
			return null;
		}
		throw err;
	}
}

async function waitForSessionReady(
	session: SessionClient,
	sessionName: string,
	child: ChildProcess,
	sleep: (ms: number) => Promise<void>,
	startupTimeoutMs: number,
): Promise<ClientResult> {
	const deadline = Date.now() + startupTimeoutMs;
	let childExitMessage: string | undefined;
	let childStartupError: Error | undefined;
	let lastConnectionError: Error | undefined;

	child.once('error', (err) => {
		childStartupError = err;
	});
	child.once('exit', (code, signal) => {
		const details =
			code !== null ? `exit code ${code}` : signal ? `signal ${signal}` : 'unknown reason';
		childExitMessage = `Daemon exited before session "${sessionName}" was ready (${details}).`;
	});

	while (Date.now() < deadline) {
		if (childStartupError) {
			throw new Error(
				`Failed to start session "${sessionName}": ${childStartupError.message}`,
			);
		}
		if (childExitMessage) {
			throw new Error(childExitMessage);
		}

		const remaining = deadline - Date.now();
		if (remaining <= 0) {
			break;
		}

		try {
			const commandPromise = session.sendCommand({
				command: 'snapshot',
				args: {},
				options: {},
			});
			const deadlinePromise = new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new ClientConnectionError('Startup probe timed out')),
					remaining,
				),
			);
			return await Promise.race([commandPromise, deadlinePromise]);
		} catch (err) {
			if (!(err instanceof ClientConnectionError)) {
				throw err;
			}
			lastConnectionError = err;
			await sleep(STARTUP_POLL_INTERVAL_MS);
		}
	}

	const context = lastConnectionError ? ` Last error: ${lastConnectionError.message}` : '';
	throw new Error(
		`Timed out waiting for session "${sessionName}" to start.${context}`,
	);
}

function getDaemonEntryPath(): string {
	const candidate = fileURLToPath(new URL('../daemon/main.js', import.meta.url));
	const sourceSegment = `${path.sep}src${path.sep}`;
	if (candidate.includes(sourceSegment)) {
		return candidate.replace(sourceSegment, `${path.sep}dist${path.sep}`);
	}
	return candidate;
}

function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
