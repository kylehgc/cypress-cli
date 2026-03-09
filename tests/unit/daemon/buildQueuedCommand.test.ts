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
			'network',
			'reload',
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
});
