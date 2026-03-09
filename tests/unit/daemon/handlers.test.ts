import { describe, expect, it, vi } from 'vitest';

import type { SocketConnection } from '../../../src/daemon/connection.js';
import {
	handleHistory,
	handleStatus,
	trackInterceptState,
	checkInterceptDrift,
} from '../../../src/daemon/handlers.js';
import type {
	CommandMessage,
	ResponseMessage,
} from '../../../src/daemon/protocol.js';
import { Session } from '../../../src/daemon/session.js';

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
