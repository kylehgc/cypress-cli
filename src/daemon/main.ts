#!/usr/bin/env node

import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import minimist from 'minimist';

import { Daemon } from './daemon.js';
import { loadSession, saveSession } from './persistence.js';
import { launchCypressOpen, launchCypressRun } from '../cypress/launcher.js';
import type { Session } from './session.js';
import { buildCypressCommand } from '../browser/selectorGenerator.js';

const DEFAULT_SESSION = 'default';

/**
 * Options for the daemon child-process entry point.
 */
export interface DaemonProcessOptions {
	session: string;
	url?: string;
	browser?: string;
	headed: boolean;
	configPath?: string;
	resume?: string;
	socketDir?: string;
	sessionsDir?: string;
	idleTimeout?: number;
}

/**
 * Parse CLI args for the background daemon process.
 */
export function parseDaemonProcessArgs(argv: string[]): DaemonProcessOptions {
	const parsed = minimist(argv, {
		boolean: ['headed'],
		string: [
			'session',
			'url',
			'browser',
			'config',
			'resume',
			'socket-dir',
			'sessions-dir',
			'idle-timeout',
		],
		alias: {
			s: 'session',
		},
	});

	return {
		session:
			typeof parsed['session'] === 'string'
				? parsed['session']
				: DEFAULT_SESSION,
		url: typeof parsed['url'] === 'string' ? parsed['url'] : undefined,
		browser:
			typeof parsed['browser'] === 'string' ? parsed['browser'] : undefined,
		headed: parsed['headed'] === true,
		configPath:
			typeof parsed['config'] === 'string' ? parsed['config'] : undefined,
		resume: typeof parsed['resume'] === 'string' ? parsed['resume'] : undefined,
		socketDir:
			typeof parsed['socket-dir'] === 'string'
				? parsed['socket-dir']
				: undefined,
		sessionsDir:
			typeof parsed['sessions-dir'] === 'string'
				? parsed['sessions-dir']
				: undefined,
		idleTimeout: (() => {
			if (typeof parsed['idle-timeout'] !== 'string') {
				return undefined;
			}
			const parsedValue = Number(parsed['idle-timeout']);
			if (!Number.isFinite(parsedValue)) {
				throw new Error(
					`Invalid --idle-timeout value "${parsed['idle-timeout']}": must be a finite number.`,
				);
			}
			return parsedValue;
		})(),
	};
}

/**
 * Start a background daemon process and keep it alive for the Cypress session.
 */
export async function runDaemonProcess(
	options: DaemonProcessOptions,
): Promise<void> {
	validateResumeOptions(options);

	const daemon = new Daemon({
		sessionId: options.session,
		socketDir: options.socketDir,
		idleTimeout: options.idleTimeout,
	});
	let session: Session | undefined;
	let hasStopped = false;

	const stopDaemon = async () => {
		if (hasStopped) {
			return;
		}
		hasStopped = true;
		await daemon.stop().catch(() => {});
	};

	process.on('SIGTERM', () => {
		void stopDaemon();
	});
	process.on('SIGINT', () => {
		void stopDaemon();
	});

	try {
		await daemon.start();
		session = await createOrRestoreSession(daemon, options);
		session.transition('running');
		seedInitialNavigateHistory(session, options);

		const iifeBundle = await loadIifeBundle();
		const launchOptions = {
			url: session.config.url,
			browser: session.config.browser,
			headed: session.config.headed,
			queue: session.queue,
			iifeBundle,
		};

		if (session.config.headed) {
			await launchCypressOpen(launchOptions);
		} else {
			const result = await launchCypressRun(launchOptions);
			if (!result.success) {
				throw new Error(
					`Cypress session "${session.id}" exited before becoming ready.`,
				);
			}
		}
	} finally {
		if (session) {
			await saveSession(session, options.sessionsDir).catch(() => {});
		}
		await stopDaemon();
	}
}

export function seedInitialNavigateHistory(
	session: Session,
	options: Pick<DaemonProcessOptions, 'resume'>,
): void {
	if (options.resume || !session.config.url) {
		return;
	}

	const hasNavigateHistory = session.commandHistory.some(
		(entry) => entry.command.action === 'navigate',
	);
	if (hasNavigateHistory) {
		return;
	}

	session.recordHistory(
		{
			id: 0,
			action: 'navigate',
			text: session.config.url,
		},
		{
			success: true,
			cypressCommand: buildCypressCommand(
				undefined,
				'navigate',
				session.config.url,
			),
		},
	);
}

async function createOrRestoreSession(
	daemon: Daemon,
	options: DaemonProcessOptions,
): Promise<Session> {
	if (!options.resume) {
		return daemon.createSession({
			id: options.session,
			url: options.url,
			browser: options.browser,
			headed: options.headed,
			configPath: options.configPath,
		});
	}

	const restored = await loadSession(options.resume, options.sessionsDir);
	if (!restored) {
		throw new Error(
			`No persisted session "${options.resume}" found to resume.`,
		);
	}

	return daemon.registerSession(restored);
}

function validateResumeOptions(options: DaemonProcessOptions): void {
	if (!options.resume) {
		return;
	}

	if (options.session !== options.resume) {
		throw new Error(
			`Cannot resume session "${options.resume}" with --session "${options.session}". Use the same session name when resuming.`,
		);
	}

	if (options.url || options.browser || options.headed || options.configPath) {
		throw new Error(
			'Cannot combine --resume with url/browser/headed/config options. Resume restores the persisted session configuration.',
		);
	}
}

async function loadIifeBundle(): Promise<string> {
	const bundlePath = fileURLToPath(
		new URL('../injected.iife.js', import.meta.url),
	);
	try {
		return await fs.readFile(bundlePath, 'utf-8');
	} catch {
		throw new Error(
			`Missing injected snapshot bundle at ${bundlePath}. Run "npm run build" before starting a session.`,
		);
	}
}

async function main(): Promise<void> {
	const options = parseDaemonProcessArgs(process.argv.slice(2));
	await runDaemonProcess(options);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main().catch((err: Error) => {
		process.stderr.write(`Fatal: ${err.message}\n`);
		process.exit(1);
	});
}
