import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import type { SocketConnection } from '../../../src/daemon/connection.js';
import {
	handleHistory,
	handleStatus,
	handleRunTest,
	trackInterceptState,
	checkInterceptDrift,
} from '../../../src/daemon/handlers.js';
import type {
	CommandMessage,
	ResponseMessage,
} from '../../../src/daemon/protocol.js';
import { Session } from '../../../src/daemon/session.js';

const cypressMock = vi.hoisted(() => ({
	run: vi.fn(),
}));

vi.mock('cypress', () => ({
	default: cypressMock,
}));

function makeConnection(): {
	conn: SocketConnection;
	send: ReturnType<typeof vi.fn<[ResponseMessage], void>>;
} {
	const send = vi.fn<[ResponseMessage], void>();
	return {
		conn: { send } as unknown as SocketConnection,
		send,
	};
}

function makeMessage(
	action: string,
	positionals: string[] = [],
	options: Record<string, unknown> = {},
): CommandMessage {
	return {
		id: 1,
		method: 'run',
		params: {
			args: {
				_: [action, ...positionals],
				...options,
			},
		},
	};
}

describe('daemon handlers', () => {
	it('reports stopped status when no session exists', () => {
		const { conn, send } = makeConnection();

		handleStatus(conn, makeMessage('status'), undefined);

		expect(send).toHaveBeenCalledWith({
			id: 1,
			result: {
				success: true,
				status: 'stopped',
			},
		});
	});

	it('formats history entries with active flags based on undo state', () => {
		const { conn, send } = makeConnection();
		const session = new Session({ id: 'session-1', url: 'https://example.com' });

		session.recordHistory(
			{ id: 1, action: 'click', ref: 'e1' },
			{ success: true },
		);
		session.recordHistory(
			{ id: 2, action: 'type', ref: 'e2', text: 'hello' },
			{ success: true },
		);
		session.undoHistory();

		handleHistory(conn, makeMessage('history'), session);

		const response = send.mock.calls[0]?.[0];
		expect(response?.id).toBe(1);
		expect(response?.result.success).toBe(true);
		expect(JSON.parse(String(response?.result.snapshot))).toEqual([
			expect.objectContaining({
				index: 0,
				action: 'click',
				active: true,
			}),
			expect.objectContaining({
				index: 1,
				action: 'type',
				active: false,
			}),
		]);
	});

	it('tracks intercept registration details from command options', () => {
		const session = new Session({ id: 'session-2' });

		trackInterceptState(session, {
			id: 1,
			action: 'intercept',
			text: '/api/users',
			options: {
				status: 201,
				body: '{"ok":true}',
				'content-type': 'application/json',
			},
		});

		expect(session.intercepts).toEqual([
			{
				pattern: '/api/users',
				statusCode: 201,
				body: '{"ok":true}',
				contentType: 'application/json',
			},
		]);
	});

	it('clears intercept registry when driver reports zero active routes', () => {
		const session = new Session({ id: 'session-3' });
		session.addIntercept({ pattern: '/api/one' });
		session.addIntercept({ pattern: '/api/two' });

		checkInterceptDrift(
			session,
			{ id: 1, action: 'network' },
			{ success: true, evalResult: '{"activeRouteCount":0}' },
		);

		expect(session.intercepts).toEqual([]);
	});
});

describe('handleRunTest', () => {
	it('returns error when file argument is missing', async () => {
		const { conn, send } = makeConnection();

		await handleRunTest(conn, makeMessage('run'));

		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 1,
				error: 'run requires a file argument.',
			}),
		);
	});

	it('rejects files without .cy.ts or .cy.js extension', async () => {
		const { conn, send } = makeConnection();

		await handleRunTest(conn, makeMessage('run', ['test.ts']));

		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 1,
				error: expect.stringContaining('Invalid test file extension'),
			}),
		);
	});

	it('returns error when file does not exist', async () => {
		const { conn, send } = makeConnection();

		await handleRunTest(conn, makeMessage('run', ['nonexistent.cy.ts']));

		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 1,
				error: expect.stringContaining('Test file not found'),
			}),
		);
	});

	it('maps successful Cypress run result to structured response', async () => {
		const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'run-test-'));
		const testFile = path.join(tmpDir, 'test.cy.ts');
		await fs.writeFile(testFile, 'describe("test", () => { it("passes", () => {}) })');

		const { conn, send } = makeConnection();

		cypressMock.run.mockResolvedValue({
			totalTests: 3,
			totalPassed: 2,
			totalFailed: 1,
			totalDuration: 1500,
			runs: [
				{
					tests: [
						{ title: ['Suite', 'passes'], state: 'passed', displayError: null },
						{ title: ['Suite', 'also passes'], state: 'passed', displayError: null },
						{ title: ['Suite', 'fails'], state: 'failed', displayError: 'AssertionError: expected true to be false' },
					],
				},
			],
		});

		await handleRunTest(conn, makeMessage('run', [testFile]));

		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 1,
				result: expect.objectContaining({
					success: false,
					totalTests: 3,
					totalPassed: 2,
					totalFailed: 1,
					duration: 1500,
					failures: [
						{
							test: 'Suite > fails',
							error: 'AssertionError: expected true to be false',
						},
					],
				}),
			}),
		);

		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it('maps Cypress failed run result (infrastructure failure)', async () => {
		const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'run-test-'));
		const testFile = path.join(tmpDir, 'test.cy.ts');
		await fs.writeFile(testFile, '// empty');

		const { conn, send } = makeConnection();

		cypressMock.run.mockResolvedValue({
			status: 'failed',
			message: 'Could not find Cypress binary',
			failures: 1,
		});

		await handleRunTest(conn, makeMessage('run', [testFile]));

		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 1,
				result: expect.objectContaining({
					success: false,
					totalTests: 0,
					totalFailed: 1,
					error: 'Could not find Cypress binary',
				}),
			}),
		);

		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it('passes project tempDir (not spec dir) to cypress.run', async () => {
		const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'run-test-'));
		const testFile = path.join(tmpDir, 'test.cy.ts');
		await fs.writeFile(testFile, 'describe("t", () => { it("p", () => {}) })');

		const { conn } = makeConnection();

		cypressMock.run.mockResolvedValue({
			totalTests: 1,
			totalPassed: 1,
			totalFailed: 0,
			totalDuration: 100,
			runs: [],
		});

		await handleRunTest(conn, makeMessage('run', [testFile]));

		expect(cypressMock.run).toHaveBeenCalledWith(
			expect.objectContaining({
				project: expect.any(String),
			}),
		);

		const calledProject = cypressMock.run.mock.calls[0][0].project as string;
		// The project arg must be an isolated temp dir, NOT the spec file's directory
		expect(calledProject).not.toBe(tmpDir);
		// cypress.run must NOT receive a spec: arg (old behavior)
		expect(cypressMock.run.mock.calls[0][0]).not.toHaveProperty('spec');

		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it('derives baseUrl from session URL origin', async () => {
		const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'run-test-'));
		const testFile = path.join(tmpDir, 'test.cy.ts');
		await fs.writeFile(testFile, 'describe("t", () => { it("p", () => {}) })');

		const { conn } = makeConnection();
		let capturedProject = '';

		cypressMock.run.mockImplementation(async (opts: Record<string, unknown>) => {
			capturedProject = opts.project as string;
			// Read the generated config before it gets cleaned up
			const configContent = await fs.readFile(
				path.join(capturedProject, 'cypress.config.js'),
				'utf-8',
			);
			expect(configContent).toContain('https://example.com');
			return {
				totalTests: 1,
				totalPassed: 1,
				totalFailed: 0,
				totalDuration: 100,
				runs: [],
			};
		});

		const session = new Session({
			id: 'test-session',
			url: 'https://example.com/page/sub?q=1',
		});

		await handleRunTest(conn, makeMessage('run', [testFile]), session);

		expect(capturedProject).not.toBe('');

		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it('cleans up temp dir after successful run', async () => {
		const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'run-test-'));
		const testFile = path.join(tmpDir, 'test.cy.ts');
		await fs.writeFile(testFile, 'describe("t", () => { it("p", () => {}) })');

		const { conn } = makeConnection();
		let capturedProject = '';

		cypressMock.run.mockImplementation(async (opts: Record<string, unknown>) => {
			capturedProject = opts.project as string;
			// Verify temp dir exists during the run
			await fs.access(capturedProject);
			return {
				totalTests: 1,
				totalPassed: 1,
				totalFailed: 0,
				totalDuration: 100,
				runs: [],
			};
		});

		await handleRunTest(conn, makeMessage('run', [testFile]));

		// After handleRunTest returns, the temp dir should be cleaned up
		expect(capturedProject).not.toBe('');
		await expect(fs.access(capturedProject)).rejects.toThrow();

		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	afterEach(() => {
		cypressMock.run.mockReset();
	});
});
