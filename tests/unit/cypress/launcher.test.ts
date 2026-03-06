import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { CommandQueue } from '../../../src/daemon/commandQueue.js';
import {
	generateCypressConfig,
	writeConfigToTemp,
	cleanupTempDir,
	type LauncherOptions,
} from '../../../src/cypress/launcher.js';

describe('generateCypressConfig', () => {
	it('generates config with taskTimeout of 300000ms', () => {
		const queue = new CommandQueue();
		const options: LauncherOptions = { queue };

		const config = generateCypressConfig(options);
		const e2e = config.e2e as Record<string, unknown>;

		expect(e2e.taskTimeout).toBe(300_000);
	});

	it('sets supportFile to false', () => {
		const queue = new CommandQueue();
		const config = generateCypressConfig({ queue });
		const e2e = config.e2e as Record<string, unknown>;

		expect(e2e.supportFile).toBe(false);
	});

	it('disables video recording', () => {
		const queue = new CommandQueue();
		const config = generateCypressConfig({ queue });
		const e2e = config.e2e as Record<string, unknown>;

		expect(e2e.video).toBe(false);
	});

	it('disables screenshot on failure', () => {
		const queue = new CommandQueue();
		const config = generateCypressConfig({ queue });
		const e2e = config.e2e as Record<string, unknown>;

		expect(e2e.screenshotOnRunFailure).toBe(false);
	});

	it('includes CYPRESS_CLI_URL in env when url is provided', () => {
		const queue = new CommandQueue();
		const config = generateCypressConfig({
			queue,
			url: 'https://example.com',
		});
		const env = config.env as Record<string, unknown>;

		expect(env['CYPRESS_CLI_URL']).toBe('https://example.com');
	});

	it('does not include CYPRESS_CLI_URL in env when url is not provided', () => {
		const queue = new CommandQueue();
		const config = generateCypressConfig({ queue });
		const env = config.env as Record<string, unknown>;

		expect(env['CYPRESS_CLI_URL']).toBeUndefined();
	});

	it('includes CYPRESS_CLI_IIFE in env when iifeBundle is provided', () => {
		const queue = new CommandQueue();
		const config = generateCypressConfig({
			queue,
			iifeBundle: '(function(){})();',
		});
		const env = config.env as Record<string, unknown>;

		expect(env['CYPRESS_CLI_IIFE']).toBe('(function(){})();');
	});
});

describe('writeConfigToTemp', () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		for (const dir of tempDirs) {
			await cleanupTempDir(dir);
		}
		tempDirs.length = 0;
	});

	it('creates a temp directory with cypress.config.js', async () => {
		const queue = new CommandQueue();
		const tempDir = await writeConfigToTemp({ queue });
		tempDirs.push(tempDir);

		const configPath = path.join(tempDir, 'cypress.config.js');
		const stat = await fs.stat(configPath);
		expect(stat.isFile()).toBe(true);
	});

	it('config file contains defineConfig', async () => {
		const queue = new CommandQueue();
		const tempDir = await writeConfigToTemp({ queue });
		tempDirs.push(tempDir);

		const configContent = await fs.readFile(
			path.join(tempDir, 'cypress.config.js'),
			'utf-8',
		);
		expect(configContent).toContain('defineConfig');
	});

	it('config file contains taskTimeout', async () => {
		const queue = new CommandQueue();
		const tempDir = await writeConfigToTemp({ queue });
		tempDirs.push(tempDir);

		const configContent = await fs.readFile(
			path.join(tempDir, 'cypress.config.js'),
			'utf-8',
		);
		expect(configContent).toContain('300000');
	});

	it('temp directory name starts with cypress-cli-', async () => {
		const queue = new CommandQueue();
		const tempDir = await writeConfigToTemp({ queue });
		tempDirs.push(tempDir);

		expect(path.basename(tempDir)).toMatch(/^cypress-cli-/);
	});
});

describe('cleanupTempDir', () => {
	it('removes a temp directory', async () => {
		const queue = new CommandQueue();
		const tempDir = await writeConfigToTemp({ queue });

		await cleanupTempDir(tempDir);

		await expect(fs.access(tempDir)).rejects.toThrow();
	});

	it('does not throw when directory does not exist', async () => {
		const nonexistent = path.join(os.tmpdir(), 'nonexistent-dir-12345');
		await expect(cleanupTempDir(nonexistent)).resolves.not.toThrow();
	});
});
