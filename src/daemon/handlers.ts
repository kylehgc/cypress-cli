import fs from 'node:fs/promises';
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
	const DRIFT_TRACKED_ACTIONS = new Set(['network', 'intercept', 'unintercept']);
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

function sendError(conn: SocketConnection, message: ErrorMessage): void {
	conn.send(message);
}
