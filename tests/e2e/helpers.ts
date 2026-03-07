/**
 * E2E test helpers: fixture server, daemon lifecycle, and command sending.
 *
 * Provides utilities for launching a full CLI → Daemon → Cypress → Browser
 * pipeline against fixture HTML pages for end-to-end testing.
 */

import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { Daemon } from '../../src/daemon/daemon.js';
import {
	sendAndReceive,
	type ClientSocketOptions,
} from '../../src/client/socketConnection.js';
import {
	launchCypressRun,
	cleanupTempDir,
	type LauncherResult,
} from '../../src/cypress/launcher.js';
import type {
	CommandMessage,
	DaemonMessage,
	ResponseMessage,
	ErrorMessage,
} from '../../src/daemon/protocol.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');
const IIFE_PATH = path.resolve(__dirname, '../../dist/injected.iife.js');

/**
 * Default timeout for waiting for command results.
 * Generous since Cypress startup and commands can be slow.
 */
const COMMAND_TIMEOUT = 60_000;

// ---------------------------------------------------------------------------
// Fixture HTTP server
// ---------------------------------------------------------------------------

/**
 * Start a static HTTP server serving the fixture HTML files.
 *
 * @returns Server instance and the port it's listening on
 */
export async function startFixtureServer(): Promise<{
	server: http.Server;
	port: number;
}> {
	return new Promise((resolve) => {
		const server = http.createServer(async (req, res) => {
			const urlPath = req.url === '/' ? '/simple.html' : req.url ?? '/';
			const filePath = path.join(FIXTURES_DIR, urlPath);

			try {
				const content = await fs.readFile(filePath, 'utf-8');
				res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
				res.end(content);
			} catch {
				res.writeHead(404);
				res.end('Not Found');
			}
		});

		server.listen(0, '127.0.0.1', () => {
			const addr = server.address() as net.AddressInfo;
			resolve({ server, port: addr.port });
		});
	});
}

/**
 * Stop the fixture HTTP server.
 */
export function stopFixtureServer(server: http.Server): Promise<void> {
	return new Promise((resolve) => {
		server.close(() => resolve());
	});
}

// ---------------------------------------------------------------------------
// IIFE bundle
// ---------------------------------------------------------------------------

/**
 * Read the IIFE bundle from the build output.
 * The IIFE must be built first via `npm run build:iife`.
 */
export async function readIifeBundle(): Promise<string> {
	try {
		return await fs.readFile(IIFE_PATH, 'utf-8');
	} catch {
		throw new Error(
			`IIFE bundle not found at ${IIFE_PATH}. Run "npm run build:iife" first.`,
		);
	}
}

// ---------------------------------------------------------------------------
// E2E session context
// ---------------------------------------------------------------------------

/**
 * A fully wired E2E test context with daemon, Cypress, and fixture server.
 */
export interface E2EContext {
	/** The daemon instance */
	daemon: Daemon;
	/** Socket path for client connections */
	socketPath: string;
	/** HTTP fixture server port */
	port: number;
	/** HTTP fixture server instance */
	server: http.Server;
	/** Background Cypress run promise */
	cypressPromise: Promise<LauncherResult>;
	/** Send a command and wait for the result */
	sendCommand: (
		id: number,
		args: string[],
		options?: Record<string, unknown>,
	) => Promise<DaemonMessage>;
	/** Tear down everything */
	teardown: () => Promise<void>;
}

/**
 * Set up a full E2E test context:
 * 1. Start HTTP fixture server
 * 2. Start daemon with a running session
 * 3. Launch Cypress in headless mode
 *
 * @param fixturePage - The fixture page to visit initially (e.g. '/simple.html')
 * @returns An E2E context with command-sending helpers
 */
export async function setupE2E(fixturePage: string = '/simple.html'): Promise<E2EContext> {
	// 1. Start fixture server
	const { server, port } = await startFixtureServer();
	const baseUrl = `http://127.0.0.1:${port}`;
	const url = `${baseUrl}${fixturePage}`;

	// 2. Read IIFE bundle
	const iifeBundle = await readIifeBundle();

	// 3. Create daemon with temp socket dir
	const socketDir = await fs.mkdtemp(
		path.join(os.tmpdir(), 'cypress-cli-e2e-'),
	);
	const sessionId = `e2e-${Date.now()}`;
	const daemon = new Daemon({
		sessionId,
		socketDir,
		idleTimeout: 0,
	});
	await daemon.start();

	// 4. Create and start session
	const session = daemon.createSession({ id: 'e2e-session' });
	session.transition('running');

	// 5. Launch Cypress in background (don't await — it runs until we stop)
	const cypressPromise = launchCypressRun({
		url,
		queue: session.queue,
		browser: 'electron',
		headed: false,
		iifeBundle,
		pluginOptions: { pollTimeout: 5_000 },
	});

	// 6. Build helpers
	const clientOpts: ClientSocketOptions = {
		socketPath: daemon.socketPath,
		responseTimeout: COMMAND_TIMEOUT,
		connectTimeout: 5_000,
		maxRetries: 0,
	};

	let commandId = 1;

	const sendCommand = async (
		id: number,
		args: string[],
		options?: Record<string, unknown>,
	): Promise<DaemonMessage> => {
		const message: CommandMessage = {
			id,
			method: 'run',
			params: {
				args: {
					_: args,
					...options,
				},
			},
		};
		return sendAndReceive(message, clientOpts);
	};

	let tornDown = false;

	const teardown = async () => {
		if (tornDown) return;
		tornDown = true;

		try {
			// Stop session (disposes queue → stop sentinel → Cypress exits polling loop)
			if (session.state !== 'stopped') {
				session.transition('stopped');
			}
		} catch {
			// Best-effort
		}

		try {
			// Wait for Cypress to finish
			const result = await Promise.race([
				cypressPromise,
				new Promise<LauncherResult>((resolve) =>
					setTimeout(() => resolve({ success: false, tempDir: '' }), 15_000),
				),
			]);
			if (result.tempDir) {
				await cleanupTempDir(result.tempDir);
			}
		} catch {
			// Best-effort
		}

		try {
			await daemon.stop();
		} catch {
			// Best-effort
		}

		try {
			await stopFixtureServer(server);
		} catch {
			// Best-effort
		}

		try {
			await fs.rm(socketDir, { recursive: true, force: true });
		} catch {
			// Best-effort
		}
	};

	// Wait for Cypress to be ready by sending a snapshot command
	// This blocks until Cypress has started and completed its initial visit
	const initialResponse = await sendCommand(commandId++, ['snapshot']);
	if ('error' in initialResponse) {
		await teardown();
		throw new Error(
			`E2E setup failed: initial snapshot returned error: ${(initialResponse as ErrorMessage).error}`,
		);
	}

	return {
		daemon,
		socketPath: daemon.socketPath,
		port,
		server,
		cypressPromise,
		sendCommand: async (
			id: number,
			args: string[],
			options?: Record<string, unknown>,
		) => {
			return sendCommand(id, args, options);
		},
		teardown,
	};
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/**
 * Extract the snapshot string from a successful response.
 */
export function getSnapshot(response: DaemonMessage): string {
	if ('error' in response) {
		throw new Error(`Expected success response, got error: ${(response as ErrorMessage).error}`);
	}
	return (response as ResponseMessage).result.snapshot ?? '';
}

/**
 * Extract the error string from an error response.
 */
export function getError(response: DaemonMessage): string {
	if ('error' in response) {
		return (response as ErrorMessage).error;
	}
	if ('result' in response && !(response as ResponseMessage).result.success) {
		return (response as ResponseMessage).result.error ?? 'Unknown error';
	}
	throw new Error('Expected error response, got success');
}

/**
 * Check if a response is successful.
 */
export function isSuccess(response: DaemonMessage): boolean {
	return 'result' in response && (response as ResponseMessage).result.success;
}

/**
 * Check if a response is an error.
 */
export function isError(response: DaemonMessage): boolean {
	return 'error' in response ||
		('result' in response && !(response as ResponseMessage).result.success);
}
