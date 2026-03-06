/**
 * Cypress Module API launcher.
 *
 * Wraps `cypress.run()` and `cypress.open()` to launch Cypress with a
 * generated temporary config that wires in our plugin (task handlers),
 * support file, and driver spec.
 *
 * The launcher is called by the daemon when an "open" command is received.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import type { CommandQueue } from '../daemon/commandQueue.js';
import type { PluginOptions } from './plugin.js';
import { QueueBridge, generateBridgeClientCode } from './queueBridge.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Task timeout (ms) set in the generated Cypress config.
 * Must be generous to accommodate the long-poll pattern without Cypress
 * killing the test.
 */
const TASK_TIMEOUT = 300_000;

/**
 * Default command timeout for Cypress commands (ms).
 */
const DEFAULT_COMMAND_TIMEOUT = 10_000;

/**
 * Temporary directory name for generated Cypress configs.
 */
const TEMP_DIR_PREFIX = 'cypress-cli-';

/**
 * Resolve the directory of the current file (ESM-compatible __dirname).
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Launcher options
// ---------------------------------------------------------------------------

/**
 * Options for launching a Cypress session.
 */
export interface LauncherOptions {
	/** URL to navigate to in the driver spec */
	url?: string;
	/** Browser to use (e.g. "chrome", "electron") */
	browser?: string;
	/** Run in headed mode (default: false → headless) */
	headed?: boolean;
	/** The daemon's command queue */
	queue: CommandQueue;
	/** Plugin options (e.g. poll timeout override) */
	pluginOptions?: PluginOptions;
	/** IIFE string for the aria snapshot library */
	iifeBundle?: string;
}

/**
 * Result from a Cypress run/open invocation.
 */
export interface LauncherResult {
	/** Whether Cypress exited successfully */
	success: boolean;
	/** Total number of tests that ran */
	totalTests?: number;
	/** Number of tests that failed */
	totalFailed?: number;
	/** The temp directory path (for cleanup) */
	tempDir: string;
}

// ---------------------------------------------------------------------------
// Config generation
// ---------------------------------------------------------------------------

/**
 * Generates a Cypress config object with static (JSON-safe) options.
 *
 * @param options - Launcher options
 * @returns The Cypress config values (no functions — those are wired in the generated JS)
 */
export function generateCypressConfig(
	options: LauncherOptions,
): Record<string, unknown> {
	const env: Record<string, unknown> = {};
	if (options.url) {
		env['CYPRESS_CLI_URL'] = options.url;
	}
	if (options.iifeBundle) {
		env['CYPRESS_CLI_IIFE'] = options.iifeBundle;
	}

	// Point to the pre-bundled driver spec (built by esbuild).
	// Resolve from __dirname (either src/cypress/ or dist/cypress/) up to
	// the project root, then into dist/cypress/driverSpec.js.
	const projectRoot = path.resolve(__dirname, '..', '..');
	const driverSpecPath = path.join(projectRoot, 'dist', 'cypress', 'driverSpec.js');

	return {
		e2e: {
			supportFile: false,
			specPattern: driverSpecPath,
			taskTimeout: TASK_TIMEOUT,
			defaultCommandTimeout: DEFAULT_COMMAND_TIMEOUT,
			video: false,
			screenshotOnRunFailure: false,
		},
		// Cypress env must be at the root config level, not nested under e2e
		env,
	};
}

/**
 * Writes the generated Cypress config to a temp directory.
 *
 * The config file wires `setupNodeEvents` by requiring the plugin module
 * at runtime. This avoids the JSON.stringify limitation where functions
 * are dropped, and ensures the Cypress Module API picks up our task
 * handlers from the config file.
 *
 * @param options - Launcher options
 * @returns Path to the created temp directory
 */
export async function writeConfigToTemp(
	options: LauncherOptions,
	bridgeSocketPath?: string,
): Promise<string> {
	const tempDir = await fs.mkdtemp(
		path.join(os.tmpdir(), TEMP_DIR_PREFIX),
	);

	const config = generateCypressConfig(options);

	// Generate the config file with bridge-based setupNodeEvents.
	// The bridge client code connects to the queue bridge socket in the
	// launcher process, enabling task handlers to communicate with the
	// in-memory CommandQueue across the process boundary.
	let bridgeCode = '';
	let setupCode = '';
	if (bridgeSocketPath) {
		bridgeCode = generateBridgeClientCode(bridgeSocketPath);
		setupCode = `
const setupNodeEvents = createBridgeSetupNodeEvents();
staticConfig.e2e.setupNodeEvents = setupNodeEvents;
`;
	}

	const configContent = `
const { defineConfig } = require('cypress');

const staticConfig = ${JSON.stringify(config, null, 2)};

${bridgeCode}
${setupCode}

module.exports = defineConfig(staticConfig);
`;
	await fs.writeFile(
		path.join(tempDir, 'cypress.config.js'),
		configContent,
		'utf-8',
	);

	// Symlink the project's node_modules into the temp directory so that
	// Cypress's bundled ts-node can resolve dependencies (e.g. typescript)
	// when processing the driver spec file.
	const projectNodeModules = await _findNodeModules();
	if (projectNodeModules) {
		const target = path.join(tempDir, 'node_modules');
		try {
			await fs.symlink(projectNodeModules, target, 'dir');
		} catch {
			// Best-effort: symlink may fail on some platforms
		}
	}

	return tempDir;
}

// ---------------------------------------------------------------------------
// Launcher
// ---------------------------------------------------------------------------

/**
 * Checks whether a Cypress run result indicates failure.
 * Cypress returns either a CypressRunResult (success) or
 * CypressFailedRunResult (with status: 'failed') on error.
 */
function isCypressRunFailed(result: unknown): boolean {
	if (!result) return true;
	if (typeof result !== 'object') return true;
	return 'status' in result && (result as { status: string }).status === 'failed';
}

/**
 * Launches Cypress in run mode (headless) with the generated config.
 *
 * The generated config file includes all e2e settings (specPattern,
 * taskTimeout, supportFile, etc.). The `setupNodeEvents` callback is
 * passed via the Module API's `config` override so Cypress picks it up.
 *
 * @param options - Launcher options
 * @returns A Promise resolving with the run result
 */
export async function launchCypressRun(
	options: LauncherOptions,
): Promise<LauncherResult> {
	// Dynamic import — cypress may not be installed as a direct dep
	const cypress = await import('cypress');

	// Start a queue bridge server so the Cypress config subprocess can
	// access the in-memory command queue via IPC.
	const pollTimeout = options.pluginOptions?.pollTimeout ?? 110_000;
	const tempDir = await fs.mkdtemp(
		path.join(os.tmpdir(), TEMP_DIR_PREFIX),
	);
	const bridgeSocketPath = path.join(tempDir, 'queue-bridge.sock');
	const bridge = new QueueBridge(bridgeSocketPath, options.queue, pollTimeout);
	await bridge.start();

	// Write the config file with the bridge socket path embedded
	const configDir = await writeConfigToTemp(options, bridgeSocketPath);

	try {
		const result = await cypress.default.run({
			project: configDir,
			browser: options.browser ?? 'electron',
			headed: options.headed ?? false,
		} as Record<string, unknown>);

		if (isCypressRunFailed(result)) {
			return {
				success: false,
				tempDir: configDir,
			};
		}

		const cypressResult = result as {
			totalTests?: number;
			totalFailed?: number;
		};
		return {
			success: (cypressResult.totalFailed ?? 0) === 0,
			totalTests: cypressResult.totalTests,
			totalFailed: cypressResult.totalFailed,
			tempDir: configDir,
		};
	} finally {
		await bridge.stop();
		// Clean up bridge temp dir (separate from config dir)
		await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
	}
}

/**
 * Launches Cypress in open mode (headed, interactive) with the generated config.
 *
 * @param options - Launcher options
 * @returns A Promise resolving with the result
 */
export async function launchCypressOpen(
	options: LauncherOptions,
): Promise<LauncherResult> {
	const cypress = await import('cypress');

	const pollTimeout = options.pluginOptions?.pollTimeout ?? 110_000;
	const tempDir = await fs.mkdtemp(
		path.join(os.tmpdir(), TEMP_DIR_PREFIX),
	);
	const bridgeSocketPath = path.join(tempDir, 'queue-bridge.sock');
	const bridge = new QueueBridge(bridgeSocketPath, options.queue, pollTimeout);
	await bridge.start();

	const configDir = await writeConfigToTemp(options, bridgeSocketPath);

	try {
		await cypress.default.open({
			project: configDir,
			browser: options.browser ?? 'chrome',
		} as Record<string, unknown>);

		return {
			success: true,
			tempDir: configDir,
		};
	} finally {
		await bridge.stop();
		await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
	}
}

/**
 * Cleans up a temporary config directory created by the launcher.
 *
 * @param tempDir - Path to the temp directory
 */
export async function cleanupTempDir(tempDir: string): Promise<void> {
	try {
		await fs.rm(tempDir, { recursive: true, force: true });
	} catch {
		// Best-effort cleanup
	}
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Walk up from the current file's directory to find the nearest node_modules.
 * Used to symlink into temp config directories for ts-node resolution.
 *
 * @returns Absolute path to node_modules, or null if not found
 */
async function _findNodeModules(): Promise<string | null> {
	let dir = __dirname;
	const root = path.parse(dir).root;

	while (dir !== root) {
		const candidate = path.join(dir, 'node_modules');
		try {
			const stat = await fs.stat(candidate);
			if (stat.isDirectory()) {
				return candidate;
			}
		} catch {
			// Not found at this level, keep going up
		}
		dir = path.dirname(dir);
	}

	return null;
}
