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
import { createSetupNodeEvents, type PluginOptions } from './plugin.js';

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
	/** Path to user's existing Cypress config to extend */
	configPath?: string;
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
 * Generates a Cypress config object wired to our plugin and spec.
 *
 * @param options - Launcher options
 * @returns The Cypress config object
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

	return {
		e2e: {
			supportFile: false,
			specPattern: '**/*.cy.ts',
			taskTimeout: TASK_TIMEOUT,
			defaultCommandTimeout: DEFAULT_COMMAND_TIMEOUT,
			video: false,
			screenshotOnRunFailure: false,
			env,
		},
	};
}

/**
 * Writes the generated Cypress config to a temp directory.
 *
 * @param options - Launcher options
 * @returns Path to the created temp directory
 */
export async function writeConfigToTemp(
	options: LauncherOptions,
): Promise<string> {
	const tempDir = await fs.mkdtemp(
		path.join(os.tmpdir(), TEMP_DIR_PREFIX),
	);

	const config = generateCypressConfig(options);
	const configContent = `
const { defineConfig } = require('cypress');

module.exports = defineConfig(${JSON.stringify(config, null, 2)});
`;
	await fs.writeFile(
		path.join(tempDir, 'cypress.config.js'),
		configContent,
		'utf-8',
	);

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
 * The `setupNodeEvents` callback is wired to register our task handlers
 * with the provided command queue.
 *
 * @param options - Launcher options
 * @returns A Promise resolving with the run result
 */
export async function launchCypressRun(
	options: LauncherOptions,
): Promise<LauncherResult> {
	// Dynamic import — cypress may not be installed as a direct dep
	const cypress = await import('cypress');

	const tempDir = await writeConfigToTemp(options);
	const setupNodeEvents = createSetupNodeEvents(
		options.queue,
		options.pluginOptions,
	);

	const env: Record<string, string> = {};
	if (options.url) {
		env['CYPRESS_CLI_URL'] = options.url;
	}
	if (options.iifeBundle) {
		env['CYPRESS_CLI_IIFE'] = options.iifeBundle;
	}

	const driverSpecPath = path.resolve(__dirname, 'driverSpec.ts');

	const result = await cypress.default.run({
		configFile: path.join(tempDir, 'cypress.config.js'),
		browser: options.browser ?? 'electron',
		headed: options.headed ?? false,
		e2e: {
			setupNodeEvents,
			supportFile: false,
			specPattern: driverSpecPath,
			taskTimeout: TASK_TIMEOUT,
		},
		env,
	} as Record<string, unknown>);

	if (isCypressRunFailed(result)) {
		return {
			success: false,
			tempDir,
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
		tempDir,
	};
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

	const tempDir = await writeConfigToTemp(options);
	const setupNodeEvents = createSetupNodeEvents(
		options.queue,
		options.pluginOptions,
	);

	const env: Record<string, string> = {};
	if (options.url) {
		env['CYPRESS_CLI_URL'] = options.url;
	}
	if (options.iifeBundle) {
		env['CYPRESS_CLI_IIFE'] = options.iifeBundle;
	}

	const driverSpecPath = path.resolve(__dirname, 'driverSpec.ts');

	await cypress.default.open({
		configFile: path.join(tempDir, 'cypress.config.js'),
		browser: options.browser ?? 'chrome',
		e2e: {
			setupNodeEvents,
			supportFile: false,
			specPattern: driverSpecPath,
			taskTimeout: TASK_TIMEOUT,
		},
		env,
	} as Record<string, unknown>);

	return {
		success: true,
		tempDir,
	};
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
