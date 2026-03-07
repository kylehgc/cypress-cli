import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { spawn } from 'node:child_process';

import {
	openSession,
	buildOpenDaemonArgs,
	resolveOpenSessionName,
} from '../../../src/client/open.js';
import { ClientConnectionError } from '../../../src/client/socketConnection.js';
import type { ParsedCommand } from '../../../src/client/command.js';
import type { ClientResult } from '../../../src/client/session.js';

class FakeChildProcess extends EventEmitter {
	unref = vi.fn();
}

function buildOpenCommand(
	url?: string,
	options: Record<string, unknown> = {},
): ParsedCommand {
	return {
		command: 'open',
		args: url ? { url } : {},
		options,
	};
}

describe('resolveOpenSessionName', () => {
	it('uses the explicit session name when resume is absent', () => {
		expect(resolveOpenSessionName(buildOpenCommand(), 'demo')).toBe('demo');
	});

	it('uses the resume value as the session name', () => {
		expect(
			resolveOpenSessionName(buildOpenCommand(undefined, { resume: 'saved-session' })),
		).toBe('saved-session');
	});

	it('rejects mismatched session and resume values', () => {
		expect(() =>
			resolveOpenSessionName(
				buildOpenCommand(undefined, { resume: 'saved-session' }),
				'other-session',
			),
		).toThrow('Cannot combine --session');
	});
});

describe('buildOpenDaemonArgs', () => {
	it('includes the daemon entry point, session, and open options', () => {
		const args = buildOpenDaemonArgs(
			'demo',
			buildOpenCommand('https://example.com', {
				browser: 'electron',
				headed: true,
				config: 'cypress.config.ts',
			}),
		);

		expect(args[0]).toContain('/dist/daemon/main.js');
		expect(args).toContain('--session');
		expect(args).toContain('demo');
		expect(args).toContain('--url');
		expect(args).toContain('https://example.com');
		expect(args).toContain('--browser');
		expect(args).toContain('electron');
		expect(args).toContain('--headed');
		expect(args).toContain('--config');
		expect(args).toContain('cypress.config.ts');
	});
});

describe('openSession', () => {
	it('reuses an existing session by navigating to the requested URL', async () => {
		const sendCommand = vi.fn().mockResolvedValue({
			success: true,
			result: { snapshot: '- main' },
		} satisfies ClientResult);

		const result = await openSession(buildOpenCommand('https://example.com'), 'demo', {
			createSession: () => ({ sendCommand }),
		});

		expect(sendCommand).toHaveBeenCalledWith({
			command: 'navigate',
			args: { url: 'https://example.com' },
			options: {},
		});
		expect(result.success).toBe(true);
	});

	it('spawns the daemon and polls until the session is ready', async () => {
		const sendCommand = vi.fn()
			.mockRejectedValueOnce(new ClientConnectionError('No session running'))
			.mockRejectedValueOnce(
				new ClientConnectionError('Cannot connect to daemon socket'),
			)
			.mockResolvedValueOnce({
				success: true,
				result: { snapshot: '- ready' },
			} satisfies ClientResult);
		const fakeChild = new FakeChildProcess();
		const spawnProcess = vi.fn().mockReturnValue(fakeChild);

		const result = await openSession(buildOpenCommand('https://example.com'), 'demo', {
			createSession: () => ({ sendCommand }),
			spawnProcess: spawnProcess as unknown as typeof spawn,
			sleep: async () => {},
			startupTimeoutMs: 1_000,
		});

		expect(spawnProcess).toHaveBeenCalled();
		expect(fakeChild.unref).toHaveBeenCalled();
		expect(result.result?.snapshot).toBe('- ready');
	});

	it('times out when the spawned daemon never becomes ready', async () => {
		const sendCommand = vi
			.fn()
			.mockRejectedValue(new ClientConnectionError('still starting'));
		const fakeChild = new FakeChildProcess();

		await expect(
			openSession(buildOpenCommand('https://example.com'), 'demo', {
				createSession: () => ({ sendCommand }),
				spawnProcess: vi.fn().mockReturnValue(
					fakeChild,
				) as unknown as typeof spawn,
				sleep: async () => {},
				startupTimeoutMs: 0,
			}),
		).rejects.toThrow('Timed out waiting for session "demo" to start.');
	});
});
