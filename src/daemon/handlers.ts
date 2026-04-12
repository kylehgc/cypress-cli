import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { generateTestFile } from '../codegen/codegen.js';
import type { QueuedCommand, CommandResult } from './commandQueue.js';
import { SocketConnection } from './connection.js';
import { inferExportFormat, stripPositionals } from './commandBuilder.js';
import type {
	CommandMessage,
	ResponseMessage,
	ErrorMessage,
} from './protocol.js';
import { type InterceptEntry, Session } from './session.js';

const NO_SESSION_ERROR =
	'No session running. Run `cypress-cli open <url>` to start one.';

/**
 * Handle the `status` daemon-local command.
 */
export function handleStatus(
	conn: SocketConnection,
	message: CommandMessage,
	session: Session | undefined,
): void {
	const response: ResponseMessage = {
		id: message.id,
		result: {
			success: true,
			...(session
				? {
						status: session.state,
						sessionId: session.id,
						url: session.config.url,
						browser: session.config.browser,
						headed: session.config.headed,
					}
				: {
						status: 'stopped',
					}),
		},
	};
	conn.send(response);
}

/**
 * Handle the `history` daemon-local command.
 */
export function handleHistory(
	conn: SocketConnection,
	message: CommandMessage,
	session: Session | undefined,
): void {
	if (!session) {
		sendError(conn, {
			id: message.id,
			error: NO_SESSION_ERROR,
		});
		return;
	}

	const entries = session.history.entries;
	const formatted = entries.map((entry) => ({
		index: entry.index,
		action: entry.command.action,
		ref: entry.command.ref,
		text: entry.command.text,
		executedAt: entry.executedAt,
		success: entry.result.success,
		active: entry.index < session.history.undoIndex,
	}));

	const response: ResponseMessage = {
		id: message.id,
		result: {
			success: true,
			snapshot: JSON.stringify(formatted),
		},
	};
	conn.send(response);
}

/**
 * Handle the `undo` daemon-local command.
 */
export function handleUndo(
	conn: SocketConnection,
	message: CommandMessage,
	session: Session | undefined,
): void {
	if (!session) {
		sendError(conn, {
			id: message.id,
			error: NO_SESSION_ERROR,
		});
		return;
	}

	const undone = session.undoHistory();
	if (!undone) {
		sendError(conn, {
			id: message.id,
			error: 'Cannot undo: history is empty. Execute a command first.',
		});
		return;
	}

	const response: ResponseMessage = {
		id: message.id,
		result: {
			success: true,
			snapshot: `Undone: ${undone.command.action}${undone.command.ref ? ' ' + undone.command.ref : ''}`,
		},
	};
	conn.send(response);
}

/**
 * Handle the `export` daemon-local command.
 */
export async function handleExport(
	conn: SocketConnection,
	message: CommandMessage,
	session: Session | undefined,
): Promise<void> {
	if (!session) {
		sendError(conn, {
			id: message.id,
			error: NO_SESSION_ERROR,
		});
		return;
	}

	const options = stripPositionals(message.params.args);

	try {
		const format = inferExportFormat(options);
		const testFile = generateTestFile(session.commandHistory, {
			describeName: options.describe as string | undefined,
			itName: options.it as string | undefined,
			format,
			baseUrl: options.baseUrl as string | undefined,
		});
		const filePath =
			typeof options.file === 'string' && options.file.length > 0
				? options.file
				: undefined;

		if (filePath) {
			await fs.mkdir(path.dirname(filePath), { recursive: true });
			await fs.writeFile(filePath, testFile, 'utf-8');
		}

		const response: ResponseMessage = {
			id: message.id,
			result: {
				success: true,
				testFile,
				...(filePath !== undefined && { filePath }),
			},
		};
		conn.send(response);
	} catch (err) {
		sendError(conn, {
			id: message.id,
			error: err instanceof Error ? err.message : String(err),
		});
	}
}

/**
 * Handle the `intercept-list` daemon-local command.
 */
export function handleInterceptList(
	conn: SocketConnection,
	message: CommandMessage,
	session: Session | undefined,
): void {
	if (!session) {
		sendError(conn, {
			id: message.id,
			error: NO_SESSION_ERROR,
		});
		return;
	}

	const response: ResponseMessage = {
		id: message.id,
		result: {
			success: true,
			evalResult: JSON.stringify(session.intercepts, null, 2),
		},
	};
	conn.send(response);
}

/**
 * Track daemon intercept registry updates after successful commands.
 */
export function trackInterceptState(
	session: Session,
	command: QueuedCommand,
): void {
	if (command.action === 'intercept' && command.text) {
		const entry: InterceptEntry = {
			pattern: command.text,
			...(command.options?.['status'] !== undefined && {
				statusCode: Number(command.options['status']),
			}),
			...(typeof command.options?.['body'] === 'string' && {
				body: command.options['body'] as string,
			}),
			...(typeof command.options?.['content-type'] === 'string' && {
				contentType: command.options['content-type'] as string,
			}),
		};
		session.addIntercept(entry);
	} else if (command.action === 'unintercept') {
		session.removeIntercept(command.text || undefined);
	}
}

/**
 * Reconcile daemon intercept state with driver-reported route counts.
 */
export function checkInterceptDrift(
	session: Session,
	command: QueuedCommand,
	result: CommandResult,
): void {
	const DRIFT_TRACKED_ACTIONS = new Set([
		'network',
		'intercept',
		'unintercept',
	]);
	if (!DRIFT_TRACKED_ACTIONS.has(command.action)) return;

	if (!result.evalResult) return;

	try {
		const parsed = JSON.parse(result.evalResult) as Record<string, unknown>;
		const driverCount = parsed['activeRouteCount'];
		if (typeof driverCount !== 'number') return;

		const daemonCount = session.intercepts.length;
		if (driverCount !== daemonCount) {
			if (driverCount === 0 && daemonCount > 0) {
				session.removeIntercept();
			}
		}
	} catch {
		// Ignore non-JSON eval payloads
	}
}

/**
 * Handle the `run` daemon-local command.
 * Runs a Cypress test file in a separate cypress.run() invocation
 * and returns structured results.
 */
export async function handleRunTest(
	conn: SocketConnection,
	message: CommandMessage,
	session?: Session,
): Promise<void> {
	const args = message.params.args;
	const file = args._[1] as string | undefined;
	const options = stripPositionals(args);

	if (!file) {
		sendError(conn, {
			id: message.id,
			error: 'run requires a file argument.',
		});
		return;
	}

	const resolvedFile = path.resolve(file);

	if (!/\.cy\.[tj]s$/.test(resolvedFile)) {
		sendError(conn, {
			id: message.id,
			error: `Invalid test file extension. Expected .cy.ts or .cy.js, got: ${path.basename(resolvedFile)}`,
		});
		return;
	}

	try {
		await fs.access(resolvedFile);
	} catch {
		sendError(conn, {
			id: message.id,
			error: `Test file not found: ${resolvedFile}`,
		});
		return;
	}

	try {
		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'cypress-cli-run-'),
		);
		try {
			const specFileName = path.basename(resolvedFile);
			const e2eConfig: Record<string, unknown> = {
				supportFile: false,
				specPattern: specFileName,
				video: false,
				screenshotOnRunFailure: false,
			};
			if (session?.config.url) {
				try {
					e2eConfig['baseUrl'] = new URL(session.config.url).origin;
				} catch {
					// Ignore invalid session URLs and run without baseUrl.
				}
			}
			await fs.copyFile(resolvedFile, path.join(tempDir, specFileName));

			await fs.writeFile(
				path.join(tempDir, 'cypress.config.js'),
				`module.exports = { e2e: ${JSON.stringify(e2eConfig)} };\n`,
				'utf-8',
			);

			await fs.writeFile(
				path.join(tempDir, 'tsconfig.json'),
				JSON.stringify(
					{
						compilerOptions: {
							target: 'ES2020',
							module: 'CommonJS',
							lib: ['ES2020', 'DOM'],
							types: ['cypress', 'node'],
							esModuleInterop: true,
							allowJs: true,
							baseUrl: '.',
						},
						include: [specFileName],
					},
					null,
					2,
				) + '\n',
				'utf-8',
			);

			try {
				await fs.symlink(
					path.resolve(process.cwd(), 'node_modules'),
					path.join(tempDir, 'node_modules'),
					'dir',
				);
			} catch {
				// Best-effort: JS specs can still run without this, but TS specs need it.
			}

			const cypress = await import('cypress');
			const result = await cypress.default.run({
				project: tempDir,
				browser: (options['browser'] as string) ?? 'electron',
				headed: options['headed'] === true,
			} as Record<string, unknown>);

			if (
				result &&
				typeof result === 'object' &&
				'status' in result &&
				(result as { status: string }).status === 'failed'
			) {
				const failedResult = result as { message?: string; failures?: number };
				const response: ResponseMessage = {
					id: message.id,
					result: {
						success: false,
						totalTests: 0,
						totalPassed: 0,
						totalFailed: failedResult.failures ?? 0,
						failures: [],
						duration: 0,
						error: failedResult.message ?? 'Cypress run failed',
					},
				};
				conn.send(response);
				return;
			}

			const runResult = result as {
				totalTests?: number;
				totalPassed?: number;
				totalFailed?: number;
				totalDuration?: number;
				runs?: Array<{
					error?: string | null;
					tests?: Array<{
						title?: string[];
						state?: string;
						displayError?: string | null;
					}>;
				}>;
			};

			const failures: Array<{ test: string; error: string }> = [];
			if (runResult.runs) {
				for (const run of runResult.runs) {
					if (run.error) {
						failures.push({
							test: specFileName,
							error: run.error,
						});
					}
					if (run.tests) {
						for (const test of run.tests) {
							if (test.state === 'failed' && test.displayError) {
								failures.push({
									test: (test.title ?? []).join(' > '),
									error: test.displayError,
								});
							}
						}
					}
				}
			}

			const response: ResponseMessage = {
				id: message.id,
				result: {
					success: (runResult.totalFailed ?? 0) === 0,
					totalTests: runResult.totalTests ?? 0,
					totalPassed: runResult.totalPassed ?? 0,
					totalFailed: runResult.totalFailed ?? 0,
					failures,
					duration: runResult.totalDuration ?? 0,
				},
			};
			conn.send(response);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
		}
	} catch (err) {
		sendError(conn, {
			id: message.id,
			error: err instanceof Error ? err.message : String(err),
		});
	}
}

function sendError(conn: SocketConnection, message: ErrorMessage): void {
	conn.send(message);
}
