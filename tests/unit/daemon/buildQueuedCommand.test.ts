import { describe, expect, it } from 'vitest';

import { buildQueuedCommand } from '../../../src/daemon/daemon.js';
import type { CommandMessage } from '../../../src/daemon/protocol.js';

function makeArgs(
	action: string,
	positionals: string[] = [],
	options: Record<string, unknown> = {},
): CommandMessage['params']['args'] {
	return {
		_: [action, ...positionals],
		...options,
	};
}

describe('buildQueuedCommand', () => {
	it('maps simple ref commands to { ref } and passes options through', () => {
		const actions = [
			'click',
			'dblclick',
			'rightclick',
			'clear',
			'check',
			'uncheck',
			'focus',
			'blur',
			'hover',
			'waitfor',
			'screenshot',
		] as const;

		for (const action of actions) {
			expect(
				buildQueuedCommand(
					1,
					makeArgs(action, ['e42'], {
						timeout: 1000,
					}),
				),
			).toEqual({
				id: 1,
				action,
				ref: 'e42',
				options: { timeout: 1000 },
			});
		}
	});

	it('handles no-arg actions', () => {
		const actions = [
			'back',
			'cookie-clear',
			'cookie-list',
			'forward',
			'localstorage-clear',
			'localstorage-list',
			'network',
			'reload',
			'sessionstorage-clear',
			'sessionstorage-list',
			'snapshot',
		] as const;

		for (const action of actions) {
			expect(buildQueuedCommand(2, makeArgs(action))).toEqual({
				id: 2,
				action,
			});
		}
	});

	it('maps text-only commands by joining all positionals', () => {
		const actions = ['press', 'wait', 'run-code', 'dialog-accept'] as const;

		for (const action of actions) {
			expect(buildQueuedCommand(3, makeArgs(action, ['Arrow', 'Down']))).toEqual({
				id: 3,
				action,
				text: 'Arrow Down',
			});
		}
	});

	it('maps type/fill/select to ref + joined text', () => {
		const actions = ['type', 'fill', 'select'] as const;

		for (const action of actions) {
			expect(
				buildQueuedCommand(4, makeArgs(action, ['e5', 'hello', 'world'])),
			).toEqual({
				id: 4,
				action,
				ref: 'e5',
				text: 'hello world',
			});
		}
	});

	it('supports missing and extra positionals', () => {
		expect(buildQueuedCommand(5, makeArgs('type'))).toEqual({
			id: 5,
			action: 'type',
		});

		expect(buildQueuedCommand(5, makeArgs('drag', ['e1', 'e2', 'ignored']))).toEqual({
			id: 5,
			action: 'drag',
			ref: 'e1',
			text: 'e2',
		});
	});

	it('maps complex positional commands', () => {
		expect(buildQueuedCommand(6, makeArgs('assert', ['e10', 'contain', 'Save']))).toEqual(
			{
				id: 6,
				action: 'assert',
				ref: 'e10',
				text: 'Save',
				options: { chainer: 'contain' },
			},
		);

		expect(
			buildQueuedCommand(7, makeArgs('asserturl', ['_', 'contain', '/commands'])),
		).toEqual({
			id: 7,
			action: 'asserturl',
			text: '/commands',
			options: { chainer: 'contain' },
		});

		expect(
			buildQueuedCommand(8, makeArgs('asserttitle', ['contain', 'Kitchen', 'Sink'])),
		).toEqual({
			id: 8,
			action: 'asserttitle',
			text: 'Kitchen Sink',
			options: { chainer: 'contain' },
		});

		expect(buildQueuedCommand(9, makeArgs('drag', ['e1', 'e2']))).toEqual({
			id: 9,
			action: 'drag',
			ref: 'e1',
			text: 'e2',
		});
	});

	it('handles eval with optional trailing element ref', () => {
		expect(buildQueuedCommand(10, makeArgs('eval', ['window.location.href', 'e12']))).toEqual(
			{
				id: 10,
				action: 'eval',
				text: 'window.location.href',
				ref: 'e12',
			},
		);

		expect(buildQueuedCommand(11, makeArgs('eval', ['window.location.href']))).toEqual({
			id: 11,
			action: 'eval',
			text: 'window.location.href',
		});
	});

	it('distinguishes scrollto ref vs free-form text', () => {
		expect(buildQueuedCommand(12, makeArgs('scrollto', ['e15']))).toEqual({
			id: 12,
			action: 'scrollto',
			ref: 'e15',
		});

		expect(buildQueuedCommand(13, makeArgs('scrollto', ['bottom', 'left']))).toEqual({
			id: 13,
			action: 'scrollto',
			text: 'bottom left',
		});
	});

	it('strips placeholder from navigate and asserturl positionals', () => {
		expect(buildQueuedCommand(14, makeArgs('navigate', ['_', 'https://example.com']))).toEqual(
			{
				id: 14,
				action: 'navigate',
				text: 'https://example.com',
			},
		);

		expect(buildQueuedCommand(15, makeArgs('asserturl', ['_', 'include', 'example']))).toEqual(
			{
				id: 15,
				action: 'asserturl',
				text: 'example',
				options: { chainer: 'include' },
			},
		);
	});

	it('supports legacy --chainer option for assert/asserturl/asserttitle', () => {
		expect(
			buildQueuedCommand(
				16,
				makeArgs('assert', ['e20', 'value'], {
					chainer: 'contain',
					timeout: 500,
				}),
			),
		).toEqual({
			id: 16,
			action: 'assert',
			ref: 'e20',
			text: 'value',
			options: { chainer: 'contain', timeout: 500 },
		});

		expect(
			buildQueuedCommand(
				17,
				makeArgs('asserttitle', ['Kitchen', 'Sink'], {
					chainer: 'include',
				}),
			),
		).toEqual({
			id: 17,
			action: 'asserttitle',
			text: 'Kitchen Sink',
			options: { chainer: 'include' },
		});
	});

	it('maps intercept and waitforresponse patterns and passes option flags through', () => {
		expect(
			buildQueuedCommand(
				18,
				makeArgs('intercept', ['/api/**'], {
					status: 201,
					body: '{"ok":true}',
					'content-type': 'application/json',
				}),
			),
		).toEqual({
			id: 18,
			action: 'intercept',
			text: '/api/**',
			options: {
				status: 201,
				body: '{"ok":true}',
				'content-type': 'application/json',
			},
		});

		expect(buildQueuedCommand(19, makeArgs('waitforresponse', ['/api/**']))).toEqual({
			id: 19,
			action: 'waitforresponse',
			text: '/api/**',
		});

		expect(buildQueuedCommand(20, makeArgs('unintercept', ['/api/**']))).toEqual({
			id: 20,
			action: 'unintercept',
			text: '/api/**',
		});
	});

	it('maps cookie commands to text and option payloads', () => {
		expect(buildQueuedCommand(21, makeArgs('cookie-get', ['session']))).toEqual({
			id: 21,
			action: 'cookie-get',
			text: 'session',
		});

		expect(
			buildQueuedCommand(
				22,
				makeArgs('cookie-set', ['session', 'hello', 'world'], {
					domain: '127.0.0.1',
					httpOnly: true,
					secure: true,
					path: '/',
				}),
			),
		).toEqual({
			id: 22,
			action: 'cookie-set',
			text: 'session',
			options: {
				domain: '127.0.0.1',
				httpOnly: true,
				secure: true,
				path: '/',
				value: 'hello world',
			},
		});

		expect(buildQueuedCommand(23, makeArgs('cookie-delete', ['session']))).toEqual({
			id: 23,
			action: 'cookie-delete',
			text: 'session',
		});
	});

	it('maps storage commands to text and option payloads', () => {
		expect(buildQueuedCommand(28, makeArgs('localstorage-get', ['token']))).toEqual({
			id: 28,
			action: 'localstorage-get',
			text: 'token',
		});

		expect(
			buildQueuedCommand(29, makeArgs('localstorage-set', ['token', 'abc123'])),
		).toEqual({
			id: 29,
			action: 'localstorage-set',
			text: 'token',
			options: { value: 'abc123' },
		});

		expect(buildQueuedCommand(30, makeArgs('localstorage-delete', ['token']))).toEqual({
			id: 30,
			action: 'localstorage-delete',
			text: 'token',
		});

		expect(buildQueuedCommand(31, makeArgs('sessionstorage-get', ['sid']))).toEqual({
			id: 31,
			action: 'sessionstorage-get',
			text: 'sid',
		});

		expect(
			buildQueuedCommand(32, makeArgs('sessionstorage-set', ['sid', 'xyz'])),
		).toEqual({
			id: 32,
			action: 'sessionstorage-set',
			text: 'sid',
			options: { value: 'xyz' },
		});

		expect(buildQueuedCommand(33, makeArgs('sessionstorage-delete', ['sid']))).toEqual({
			id: 33,
			action: 'sessionstorage-delete',
			text: 'sid',
		});
	});

	it('maps resize width/height from positionals while merging options', () => {
		expect(
			buildQueuedCommand(
				24,
				makeArgs('resize', ['1200', '800'], {
					reset: true,
				}),
			),
		).toEqual({
			id: 24,
			action: 'resize',
			options: {
				reset: true,
				width: '1200',
				height: '800',
			},
		});
	});

	it('maps upload and blocks paths that resolve outside cwd', () => {
		expect(buildQueuedCommand(25, makeArgs('upload', ['e3', 'package.json']))).toEqual({
			id: 25,
			action: 'upload',
			ref: 'e3',
			text: 'package.json',
		});

		expect(() =>
			buildQueuedCommand(26, makeArgs('upload', ['e3', '../outside.txt'])),
		).toThrow('resolves outside the working directory');
	});

	it('falls back to default mapping for unknown actions', () => {
		expect(buildQueuedCommand(27, makeArgs('custom', ['e55', 'foo', 'bar']))).toEqual({
			id: 27,
			action: 'custom',
			ref: 'e55',
			text: 'foo bar',
		});
	});

	it('maps localStorage commands to text and option payloads', () => {
		expect(buildQueuedCommand(30, makeArgs('localstorage-list', []))).toEqual({
			id: 30,
			action: 'localstorage-list',
		});

		expect(buildQueuedCommand(31, makeArgs('localstorage-get', ['token']))).toEqual({
			id: 31,
			action: 'localstorage-get',
			text: 'token',
		});

		expect(buildQueuedCommand(32, makeArgs('localstorage-set', ['token', 'abc123']))).toEqual({
			id: 32,
			action: 'localstorage-set',
			text: 'token',
			options: { value: 'abc123' },
		});

		expect(buildQueuedCommand(33, makeArgs('localstorage-delete', ['token']))).toEqual({
			id: 33,
			action: 'localstorage-delete',
			text: 'token',
		});

		expect(buildQueuedCommand(34, makeArgs('localstorage-clear', []))).toEqual({
			id: 34,
			action: 'localstorage-clear',
		});
	});

	it('maps sessionStorage commands to text and option payloads', () => {
		expect(buildQueuedCommand(35, makeArgs('sessionstorage-list', []))).toEqual({
			id: 35,
			action: 'sessionstorage-list',
		});

		expect(buildQueuedCommand(36, makeArgs('sessionstorage-get', ['tab-id']))).toEqual({
			id: 36,
			action: 'sessionstorage-get',
			text: 'tab-id',
		});

		expect(buildQueuedCommand(37, makeArgs('sessionstorage-set', ['tab-id', '42']))).toEqual({
			id: 37,
			action: 'sessionstorage-set',
			text: 'tab-id',
			options: { value: '42' },
		});

		expect(buildQueuedCommand(38, makeArgs('sessionstorage-delete', ['tab-id']))).toEqual({
			id: 38,
			action: 'sessionstorage-delete',
			text: 'tab-id',
		});

		expect(buildQueuedCommand(39, makeArgs('sessionstorage-clear', []))).toEqual({
			id: 39,
			action: 'sessionstorage-clear',
		});
	});

	it('maps console command with optional level and options', () => {
		expect(buildQueuedCommand(40, makeArgs('console', []))).toEqual({
			id: 40,
			action: 'console',
		});

		expect(buildQueuedCommand(41, makeArgs('console', ['warning']))).toEqual({
			id: 41,
			action: 'console',
			text: 'warning',
		});

		expect(
			buildQueuedCommand(42, makeArgs('console', [], { clear: true })),
		).toEqual({
			id: 42,
			action: 'console',
			options: { clear: true },
		});

		expect(
			buildQueuedCommand(43, makeArgs('console', ['error'], { clear: true })),
		).toEqual({
			id: 43,
			action: 'console',
			text: 'error',
			options: { clear: true },
		});
	});
});
