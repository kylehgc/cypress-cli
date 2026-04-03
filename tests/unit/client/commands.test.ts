import { describe, it, expect } from 'vitest';

import {
	declareCommand,
	parseCommand,
	CommandValidationError,
} from '../../../src/client/command.js';
import {
	allCommands,
	buildRegistry,
	commandRegistry,
	click,
	type_,
	navigate,
	assert_,
	snapshot,
	open,
	stop,
	status,
	install,
	back,
	forward,
	reload,
	dblclick,
	rightclick,
	clear,
	check,
	uncheck,
	select,
	focus,
	blur,
	scrollto,
	hover,
	press,
	asserturl,
	asserttitle,
	export_,
	history,
	undo,
	wait,
	waitfor,
	runCode,
	network,
	intercept,
	interceptList,
	unintercept,
	waitforresponse,
	cookieList,
	cookieGet,
	cookieSet,
	cookieDelete,
	cookieClear,
	fill,
	dialogAccept,
	dialogDismiss,
	resize,
	screenshot,
	drag,
	upload,
	eval_,
	stateSave,
	stateLoad,
	localstorageList,
	localstorageGet,
	localstorageSet,
	localstorageDelete,
	localstorageClear,
	sessionstorageList,
	sessionstorageGet,
	sessionstorageSet,
	sessionstorageDelete,
	sessionstorageClear,
	console_,
} from '../../../src/client/commands.js';
import { z } from 'zod';

describe('declareCommand', () => {
	it('creates a frozen command schema', () => {
		const cmd = declareCommand({
			name: 'test',
			category: 'core',
			description: 'A test command',
			args: z.object({ foo: z.string() }),
			options: z.object({}),
		});

		expect(cmd.name).toBe('test');
		expect(cmd.category).toBe('core');
		expect(cmd.description).toBe('A test command');
		expect(Object.isFrozen(cmd)).toBe(true);
	});

	it('preserves zod schemas for validation', () => {
		const cmd = declareCommand({
			name: 'test',
			category: 'interaction',
			description: 'Test',
			args: z.object({ ref: z.string() }),
			options: z.object({ force: z.boolean().optional() }),
		});

		const argsResult = cmd.args.safeParse({ ref: 'e5' });
		expect(argsResult.success).toBe(true);

		const badResult = cmd.args.safeParse({});
		expect(badResult.success).toBe(false);
	});
});

describe('command schemas', () => {
	it('defines all 62 commands', () => {
		expect(allCommands).toHaveLength(62);
	});

	it('registers all commands plus aliases in the registry', () => {
		expect(commandRegistry.size).toBe(66);
	});

	describe('categories', () => {
		it('has core commands', () => {
			expect(open.category).toBe('core');
			expect(stop.category).toBe('core');
			expect(status.category).toBe('core');
			expect(install.category).toBe('core');
			expect(snapshot.category).toBe('core');
		});

		it('has navigation commands', () => {
			expect(navigate.category).toBe('navigation');
			expect(back.category).toBe('navigation');
			expect(forward.category).toBe('navigation');
			expect(reload.category).toBe('navigation');
		});

		it('has interaction commands', () => {
			expect(click.category).toBe('interaction');
			expect(dblclick.category).toBe('interaction');
			expect(rightclick.category).toBe('interaction');
			expect(type_.category).toBe('interaction');
			expect(clear.category).toBe('interaction');
			expect(check.category).toBe('interaction');
			expect(uncheck.category).toBe('interaction');
			expect(select.category).toBe('interaction');
			expect(focus.category).toBe('interaction');
			expect(blur.category).toBe('interaction');
			expect(scrollto.category).toBe('interaction');
			expect(hover.category).toBe('interaction');
			expect(fill.category).toBe('interaction');
			expect(dialogAccept.category).toBe('interaction');
			expect(dialogDismiss.category).toBe('interaction');
			expect(resize.category).toBe('interaction');
			expect(drag.category).toBe('interaction');
			expect(upload.category).toBe('interaction');
		});

		it('has screenshot command', () => {
			expect(screenshot.category).toBe('core');
		});

		it('has console command', () => {
			expect(console_.category).toBe('core');
		});

		it('has keyboard commands', () => {
			expect(press.category).toBe('keyboard');
		});

		it('has assertion commands', () => {
			expect(assert_.category).toBe('assertion');
			expect(asserturl.category).toBe('assertion');
			expect(asserttitle.category).toBe('assertion');
		});

		it('has export commands', () => {
			expect(export_.category).toBe('export');
			expect(history.category).toBe('export');
			expect(undo.category).toBe('export');
		});

		it('has wait commands', () => {
			expect(wait.category).toBe('wait');
			expect(waitfor.category).toBe('wait');
		});

		it('has execution commands', () => {
			expect(runCode.category).toBe('execution');
			expect(eval_.category).toBe('execution');
		});

		it('has network commands', () => {
			expect(network.category).toBe('network');
			expect(intercept.category).toBe('network');
			expect(interceptList.category).toBe('network');
			expect(unintercept.category).toBe('network');
			expect(waitforresponse.category).toBe('network');
		});

		it('has storage commands', () => {
			expect(cookieList.category).toBe('storage');
			expect(cookieGet.category).toBe('storage');
			expect(cookieSet.category).toBe('storage');
			expect(cookieDelete.category).toBe('storage');
			expect(cookieClear.category).toBe('storage');
			expect(stateSave.category).toBe('storage');
			expect(stateLoad.category).toBe('storage');
			expect(localstorageList.category).toBe('storage');
			expect(localstorageGet.category).toBe('storage');
			expect(localstorageSet.category).toBe('storage');
			expect(localstorageDelete.category).toBe('storage');
			expect(localstorageClear.category).toBe('storage');
			expect(sessionstorageList.category).toBe('storage');
			expect(sessionstorageGet.category).toBe('storage');
			expect(sessionstorageSet.category).toBe('storage');
			expect(sessionstorageDelete.category).toBe('storage');
			expect(sessionstorageClear.category).toBe('storage');
		});
	});

	describe('schema validation', () => {
		it('click requires ref', () => {
			const good = click.args.safeParse({ ref: 'e5' });
			expect(good.success).toBe(true);

			const bad = click.args.safeParse({});
			expect(bad.success).toBe(false);
		});

		it('type requires ref and text', () => {
			const good = type_.args.safeParse({ ref: 'e3', text: 'hello' });
			expect(good.success).toBe(true);

			const missingText = type_.args.safeParse({ ref: 'e3' });
			expect(missingText.success).toBe(false);

			const missingRef = type_.args.safeParse({ text: 'hello' });
			expect(missingRef.success).toBe(false);
		});

		it('navigate requires url', () => {
			const good = navigate.args.safeParse({ url: 'https://example.com' });
			expect(good.success).toBe(true);

			const bad = navigate.args.safeParse({});
			expect(bad.success).toBe(false);
		});

		it('assert requires ref and chainer, value is optional', () => {
			const withValue = assert_.args.safeParse({
				ref: 'e5',
				chainer: 'have.text',
				value: 'Hello',
			});
			expect(withValue.success).toBe(true);

			const withoutValue = assert_.args.safeParse({
				ref: 'e5',
				chainer: 'be.visible',
			});
			expect(withoutValue.success).toBe(true);

			const missingChainer = assert_.args.safeParse({ ref: 'e5' });
			expect(missingChainer.success).toBe(false);
		});

		it('snapshot diff option is optional boolean', () => {
			const noDiff = snapshot.options.safeParse({});
			expect(noDiff.success).toBe(true);

			const withDiff = snapshot.options.safeParse({ diff: true });
			expect(withDiff.success).toBe(true);
		});

		it('snapshot filename option is optional string', () => {
			const noFilename = snapshot.options.safeParse({});
			expect(noFilename.success).toBe(true);

			const withFilename = snapshot.options.safeParse({
				filename: 'custom.yml',
			});
			expect(withFilename.success).toBe(true);
			if (withFilename.success) {
				expect(withFilename.data.filename).toBe('custom.yml');
			}
		});

		it('open snapshot-dir option is optional string', () => {
			const noDir = open.options.safeParse({});
			expect(noDir.success).toBe(true);

			const withDir = open.options.safeParse({ 'snapshot-dir': '/tmp/snaps' });
			expect(withDir.success).toBe(true);
		});

		it('install requires --skills', () => {
			const missingSkills = install.options.safeParse({});
			expect(missingSkills.success).toBe(false);

			const withSkills = install.options.safeParse({ skills: true });
			expect(withSkills.success).toBe(true);
		});

		it('wait requires ms as a number', () => {
			const good = wait.args.safeParse({ ms: 1000 });
			expect(good.success).toBe(true);

			// z.coerce.number() coerces strings to numbers
			const stringMs = wait.args.safeParse({ ms: '500' });
			expect(stringMs.success).toBe(true);
			if (stringMs.success) {
				expect(stringMs.data.ms).toBe(500);
			}
		});

		it('open has optional url', () => {
			const noUrl = open.args.safeParse({});
			expect(noUrl.success).toBe(true);

			const withUrl = open.args.safeParse({ url: 'https://example.com' });
			expect(withUrl.success).toBe(true);
		});

		it('export supports file, format, and naming options', () => {
			const parsed = export_.options.safeParse({
				file: 'generated/example.cy.ts',
				format: 'ts',
				describe: 'Generated flow',
				it: 'replays the interaction',
				baseUrl: 'https://example.com',
			});
			expect(parsed.success).toBe(true);
		});

		it('select requires ref and value', () => {
			const good = select.args.safeParse({ ref: 'e2', value: 'option1' });
			expect(good.success).toBe(true);

			const missingValue = select.args.safeParse({ ref: 'e2' });
			expect(missingValue.success).toBe(false);
		});

		it('click options are optional', () => {
			const noOptions = click.options.safeParse({});
			expect(noOptions.success).toBe(true);

			const withForce = click.options.safeParse({ force: true });
			expect(withForce.success).toBe(true);

			const withMultiple = click.options.safeParse({ multiple: true });
			expect(withMultiple.success).toBe(true);
		});

		it('run-code requires code', () => {
			const good = runCode.args.safeParse({
				code: 'document.title',
			});
			expect(good.success).toBe(true);

			const multiLine = runCode.args.safeParse({
				code: 'const x = 1;\nconst y = 2;\nx + y',
			});
			expect(multiLine.success).toBe(true);

			const missing = runCode.args.safeParse({});
			expect(missing.success).toBe(false);
		});

		it('eval requires expression, ref is optional', () => {
			const good = eval_.args.safeParse({
				expression: 'document.title',
			});
			expect(good.success).toBe(true);

			const withRef = eval_.args.safeParse({
				expression: 'el => el.textContent',
				ref: 'e5',
			});
			expect(withRef.success).toBe(true);

			const missing = eval_.args.safeParse({});
			expect(missing.success).toBe(false);
		});

		it('network requires no args', () => {
			const good = network.args.safeParse({});
			expect(good.success).toBe(true);
		});

		it('intercept requires pattern', () => {
			const good = intercept.args.safeParse({ pattern: '**/api/**' });
			expect(good.success).toBe(true);

			const missing = intercept.args.safeParse({});
			expect(missing.success).toBe(false);
		});

		it('intercept options are optional', () => {
			const noOptions = intercept.options.safeParse({});
			expect(noOptions.success).toBe(true);

			const withStatus = intercept.options.safeParse({ status: 200 });
			expect(withStatus.success).toBe(true);

			const withBody = intercept.options.safeParse({
				body: '{"message":"ok"}',
			});
			expect(withBody.success).toBe(true);

			const withContentType = intercept.options.safeParse({
				'content-type': 'application/json',
			});
			expect(withContentType.success).toBe(true);

			const withAll = intercept.options.safeParse({
				status: 404,
				body: '{"error":"not found"}',
				'content-type': 'application/json',
			});
			expect(withAll.success).toBe(true);
		});

		it('intercept-list requires no args', () => {
			const good = interceptList.args.safeParse({});
			expect(good.success).toBe(true);
		});

		it('unintercept has optional pattern', () => {
			const noPattern = unintercept.args.safeParse({});
			expect(noPattern.success).toBe(true);

			const withPattern = unintercept.args.safeParse({
				pattern: '**/api/**',
			});
			expect(withPattern.success).toBe(true);
		});

		it('waitforresponse requires pattern', () => {
			const good = waitforresponse.args.safeParse({
				pattern: '**/api/articles*',
			});
			expect(good.success).toBe(true);

			const missing = waitforresponse.args.safeParse({});
			expect(missing.success).toBe(false);
		});

		it('waitforresponse timeout is optional', () => {
			const noTimeout = waitforresponse.options.safeParse({});
			expect(noTimeout.success).toBe(true);

			const withTimeout = waitforresponse.options.safeParse({ timeout: 10000 });
			expect(withTimeout.success).toBe(true);
		});

		it('cookie-list domain filter is optional', () => {
			expect(cookieList.args.safeParse({})).toMatchObject({ success: true });
			expect(cookieList.options.safeParse({})).toMatchObject({ success: true });
			expect(
				cookieList.options.safeParse({
					domain: '127.0.0.1',
				}),
			).toMatchObject({ success: true });
		});

		it('cookie-get requires a cookie name', () => {
			expect(cookieGet.args.safeParse({ name: 'session' })).toMatchObject({
				success: true,
			});
			expect(cookieGet.args.safeParse({})).toMatchObject({ success: false });
		});

		it('cookie-set requires name and value and accepts cookie flags', () => {
			expect(
				cookieSet.args.safeParse({
					name: 'session',
					value: 'abc123',
				}),
			).toMatchObject({ success: true });
			expect(
				cookieSet.options.safeParse({
					domain: '127.0.0.1',
					httpOnly: true,
					secure: true,
					path: '/',
				}),
			).toMatchObject({ success: true });
			expect(cookieSet.args.safeParse({ name: 'session' })).toMatchObject({
				success: false,
			});
		});

		it('cookie-delete requires a cookie name', () => {
			expect(cookieDelete.args.safeParse({ name: 'session' })).toMatchObject({
				success: true,
			});
			expect(cookieDelete.args.safeParse({})).toMatchObject({
				success: false,
			});
		});

		it('cookie-clear requires no args or options', () => {
			expect(cookieClear.args.safeParse({})).toMatchObject({ success: true });
			expect(cookieClear.options.safeParse({})).toMatchObject({ success: true });
		});

		it('localstorage-list requires no args', () => {
			expect(localstorageList.args.safeParse({})).toMatchObject({
				success: true,
			});
		});

		it('localstorage-get requires a key', () => {
			expect(
				localstorageGet.args.safeParse({ key: 'token' }),
			).toMatchObject({ success: true });
			expect(localstorageGet.args.safeParse({})).toMatchObject({
				success: false,
			});
		});

		it('localstorage-set requires key and value', () => {
			expect(
				localstorageSet.args.safeParse({ key: 'token', value: 'abc' }),
			).toMatchObject({ success: true });
			expect(
				localstorageSet.args.safeParse({ key: 'token' }),
			).toMatchObject({ success: false });
		});

		it('localstorage-delete requires a key', () => {
			expect(
				localstorageDelete.args.safeParse({ key: 'token' }),
			).toMatchObject({ success: true });
			expect(localstorageDelete.args.safeParse({})).toMatchObject({
				success: false,
			});
		});

		it('localstorage-clear requires no args', () => {
			expect(localstorageClear.args.safeParse({})).toMatchObject({
				success: true,
			});
		});

		it('sessionstorage-list requires no args', () => {
			expect(sessionstorageList.args.safeParse({})).toMatchObject({
				success: true,
			});
		});

		it('sessionstorage-get requires a key', () => {
			expect(
				sessionstorageGet.args.safeParse({ key: 'sid' }),
			).toMatchObject({ success: true });
			expect(sessionstorageGet.args.safeParse({})).toMatchObject({
				success: false,
			});
		});

		it('sessionstorage-set requires key and value', () => {
			expect(
				sessionstorageSet.args.safeParse({ key: 'sid', value: 'x' }),
			).toMatchObject({ success: true });
			expect(
				sessionstorageSet.args.safeParse({ key: 'sid' }),
			).toMatchObject({ success: false });
		});

		it('sessionstorage-delete requires a key', () => {
			expect(
				sessionstorageDelete.args.safeParse({ key: 'sid' }),
			).toMatchObject({ success: true });
			expect(sessionstorageDelete.args.safeParse({})).toMatchObject({
				success: false,
			});
		});

		it('sessionstorage-clear requires no args', () => {
			expect(sessionstorageClear.args.safeParse({})).toMatchObject({
				success: true,
			});
		});

		it('fill requires ref and text', () => {
			const good = fill.args.safeParse({ ref: 'e3', text: 'hello' });
			expect(good.success).toBe(true);

			const missingText = fill.args.safeParse({ ref: 'e3' });
			expect(missingText.success).toBe(false);

			const missingRef = fill.args.safeParse({ text: 'hello' });
			expect(missingRef.success).toBe(false);
		});

		it('dialog-accept has optional text for prompt', () => {
			const noText = dialogAccept.args.safeParse({});
			expect(noText.success).toBe(true);

			const withText = dialogAccept.args.safeParse({ text: 'prompt answer' });
			expect(withText.success).toBe(true);
		});

		it('dialog-dismiss requires no args', () => {
			const good = dialogDismiss.args.safeParse({});
			expect(good.success).toBe(true);
		});

		it('resize requires width and height as numbers', () => {
			const good = resize.args.safeParse({ width: 1280, height: 720 });
			expect(good.success).toBe(true);

			// z.coerce.number() coerces strings
			const fromStrings = resize.args.safeParse({
				width: '1024',
				height: '768',
			});
			expect(fromStrings.success).toBe(true);
			if (fromStrings.success) {
				expect(fromStrings.data.width).toBe(1024);
				expect(fromStrings.data.height).toBe(768);
			}

			const missingHeight = resize.args.safeParse({ width: 1280 });
			expect(missingHeight.success).toBe(false);
		});

		it('screenshot has optional ref and filename', () => {
			const noArgs = screenshot.args.safeParse({});
			expect(noArgs.success).toBe(true);

			const withRef = screenshot.args.safeParse({ ref: 'e5' });
			expect(withRef.success).toBe(true);

			const withFilename = screenshot.options.safeParse({
				filename: 'test.png',
			});
			expect(withFilename.success).toBe(true);
		});

		it('drag requires startRef and endRef', () => {
			const good = drag.args.safeParse({ startRef: 'e3', endRef: 'e5' });
			expect(good.success).toBe(true);

			const missingEnd = drag.args.safeParse({ startRef: 'e3' });
			expect(missingEnd.success).toBe(false);

			const missingStart = drag.args.safeParse({ endRef: 'e5' });
			expect(missingStart.success).toBe(false);
		});

		it('upload requires ref and file', () => {
			const good = upload.args.safeParse({ ref: 'e3', file: 'test.pdf' });
			expect(good.success).toBe(true);

			const missingFile = upload.args.safeParse({ ref: 'e3' });
			expect(missingFile.success).toBe(false);

			const missingRef = upload.args.safeParse({ file: 'test.pdf' });
			expect(missingRef.success).toBe(false);
		});

		it('state-save has optional filename', () => {
			const noArgs = stateSave.args.safeParse({});
			expect(noArgs.success).toBe(true);

			const withFilename = stateSave.args.safeParse({
				filename: 'my-state.json',
			});
			expect(withFilename.success).toBe(true);
			if (withFilename.success) {
				expect(withFilename.data.filename).toBe('my-state.json');
			}
		});

		it('state-load requires filename', () => {
			const good = stateLoad.args.safeParse({
				filename: 'my-state.json',
			});
			expect(good.success).toBe(true);

			const missing = stateLoad.args.safeParse({});
			expect(missing.success).toBe(false);
		});

		it('localstorage-list requires no args', () => {
			expect(localstorageList.args.safeParse({})).toMatchObject({
				success: true,
			});
		});

		it('localstorage-get requires a key', () => {
			expect(
				localstorageGet.args.safeParse({ key: 'token' }),
			).toMatchObject({ success: true });
			expect(localstorageGet.args.safeParse({})).toMatchObject({
				success: false,
			});
		});

		it('localstorage-set requires key and value', () => {
			expect(
				localstorageSet.args.safeParse({ key: 'token', value: 'abc' }),
			).toMatchObject({ success: true });
			expect(
				localstorageSet.args.safeParse({ key: 'token' }),
			).toMatchObject({ success: false });
		});

		it('localstorage-delete requires a key', () => {
			expect(
				localstorageDelete.args.safeParse({ key: 'token' }),
			).toMatchObject({ success: true });
			expect(localstorageDelete.args.safeParse({})).toMatchObject({
				success: false,
			});
		});

		it('localstorage-clear requires no args', () => {
			expect(localstorageClear.args.safeParse({})).toMatchObject({
				success: true,
			});
		});

		it('sessionstorage-list requires no args', () => {
			expect(sessionstorageList.args.safeParse({})).toMatchObject({
				success: true,
			});
		});

		it('sessionstorage-get requires a key', () => {
			expect(
				sessionstorageGet.args.safeParse({ key: 'tab-id' }),
			).toMatchObject({ success: true });
			expect(sessionstorageGet.args.safeParse({})).toMatchObject({
				success: false,
			});
		});

		it('sessionstorage-set requires key and value', () => {
			expect(
				sessionstorageSet.args.safeParse({ key: 'tab-id', value: '1' }),
			).toMatchObject({ success: true });
			expect(
				sessionstorageSet.args.safeParse({ key: 'tab-id' }),
			).toMatchObject({ success: false });
		});

		it('sessionstorage-delete requires a key', () => {
			expect(
				sessionstorageDelete.args.safeParse({ key: 'tab-id' }),
			).toMatchObject({ success: true });
			expect(sessionstorageDelete.args.safeParse({})).toMatchObject({
				success: false,
			});
		});

		it('sessionstorage-clear requires no args', () => {
			expect(sessionstorageClear.args.safeParse({})).toMatchObject({
				success: true,
			});
		});

		it('console has optional level filter', () => {
			expect(console_.args.safeParse({})).toMatchObject({ success: true });
			expect(
				console_.args.safeParse({ level: 'error' }),
			).toMatchObject({ success: true });
			expect(
				console_.args.safeParse({ level: 'warning' }),
			).toMatchObject({ success: true });
			expect(
				console_.args.safeParse({ level: 'info' }),
			).toMatchObject({ success: true });
			expect(
				console_.args.safeParse({ level: 'debug' }),
			).toMatchObject({ success: true });
			expect(
				console_.args.safeParse({ level: 'invalid' }),
			).toMatchObject({ success: false });
		});

		it('console --clear option is optional boolean', () => {
			expect(console_.options.safeParse({})).toMatchObject({ success: true });
			expect(
				console_.options.safeParse({ clear: true }),
			).toMatchObject({ success: true });
		});
	});
});

describe('parseCommand', () => {
	it("parses 'click e5' correctly", () => {
		const result = parseCommand({ _: ['click', 'e5'] }, commandRegistry);
		expect(result).toEqual({
			command: 'click',
			args: { ref: 'e5' },
			options: {},
		});
	});

	it("parses 'type e3 hello world' correctly", () => {
		const result = parseCommand(
			{ _: ['type', 'e3', 'hello', 'world'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'type',
			args: { ref: 'e3', text: 'hello world' },
			options: {},
		});
	});

	it("parses 'navigate https://example.com' correctly", () => {
		const result = parseCommand(
			{ _: ['navigate', 'https://example.com'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'navigate',
			args: { url: 'https://example.com' },
			options: {},
		});
	});

	it('parses options with --flag syntax', () => {
		const result = parseCommand(
			{ _: ['click', 'e5'], force: true },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'click',
			args: { ref: 'e5' },
			options: { force: true },
		});
	});

	it('rejects unknown command', () => {
		expect(() => {
			parseCommand({ _: ['unknowncommand'] }, commandRegistry);
		}).toThrow(CommandValidationError);
		expect(() => {
			parseCommand({ _: ['unknowncommand'] }, commandRegistry);
		}).toThrow(/Unknown command "unknowncommand"/);
	});

	it('rejects missing required args', () => {
		expect(() => {
			parseCommand({ _: ['click'] }, commandRegistry);
		}).toThrow(CommandValidationError);
		expect(() => {
			parseCommand({ _: ['click'] }, commandRegistry);
		}).toThrow(/Invalid arguments for "click"/);
	});

	it("parses 'assert e5 have.text Hello' correctly", () => {
		const result = parseCommand(
			{ _: ['assert', 'e5', 'have.text', 'Hello'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'assert',
			args: { ref: 'e5', chainer: 'have.text', value: 'Hello' },
			options: {},
		});
	});

	it('rejects empty command', () => {
		expect(() => {
			parseCommand({ _: [] }, commandRegistry);
		}).toThrow(CommandValidationError);
		expect(() => {
			parseCommand({ _: [] }, commandRegistry);
		}).toThrow(/No command provided/);
	});

	it("parses 'snapshot --diff' correctly", () => {
		const result = parseCommand(
			{ _: ['snapshot'], diff: true },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'snapshot',
			args: {},
			options: { diff: true },
		});
	});

	it('parses commands with no args (back, forward, reload)', () => {
		const backResult = parseCommand({ _: ['back'] }, commandRegistry);
		expect(backResult).toEqual({ command: 'back', args: {}, options: {} });

		const forwardResult = parseCommand({ _: ['forward'] }, commandRegistry);
		expect(forwardResult).toEqual({
			command: 'forward',
			args: {},
			options: {},
		});

		const reloadResult = parseCommand({ _: ['reload'] }, commandRegistry);
		expect(reloadResult).toEqual({ command: 'reload', args: {}, options: {} });
	});

	it("parses 'select e2 option1' correctly", () => {
		const result = parseCommand(
			{ _: ['select', 'e2', 'option1'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'select',
			args: { ref: 'e2', value: 'option1' },
			options: {},
		});
	});

	it("parses 'press Enter' correctly", () => {
		const result = parseCommand({ _: ['press', 'Enter'] }, commandRegistry);
		expect(result).toEqual({
			command: 'press',
			args: { key: 'Enter' },
			options: {},
		});
	});

	it("parses 'wait 2000' correctly", () => {
		const result = parseCommand({ _: ['wait', '2000'] }, commandRegistry);
		expect(result).toEqual({
			command: 'wait',
			args: { ms: 2000 },
			options: {},
		});
	});

	it("parses 'asserturl include /dashboard' correctly", () => {
		const result = parseCommand(
			{ _: ['asserturl', 'include', '/dashboard'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'asserturl',
			args: { chainer: 'include', value: '/dashboard' },
			options: {},
		});
	});

	it("parses 'asserttitle eq My Page' correctly", () => {
		const result = parseCommand(
			{ _: ['asserttitle', 'eq', 'My Page'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'asserttitle',
			args: { chainer: 'eq', value: 'My Page' },
			options: {},
		});
	});

	it("parses 'open https://example.com --browser chrome' correctly", () => {
		const result = parseCommand(
			{ _: ['open', 'https://example.com'], browser: 'chrome' },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'open',
			args: { url: 'https://example.com' },
			options: { browser: 'chrome' },
		});
	});

	it('parses export with --file option', () => {
		const result = parseCommand(
			{ _: ['export'], file: 'output.cy.ts' },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'export',
			args: {},
			options: { file: 'output.cy.ts' },
		});
	});

	it("parses 'waitfor e5 --timeout 5000' correctly", () => {
		const result = parseCommand(
			{ _: ['waitfor', 'e5'], timeout: 5000 },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'waitfor',
			args: { ref: 'e5' },
			options: { timeout: 5000 },
		});
	});

	it("parses 'hover e3' correctly", () => {
		const result = parseCommand({ _: ['hover', 'e3'] }, commandRegistry);
		expect(result).toEqual({
			command: 'hover',
			args: { ref: 'e3' },
			options: {},
		});
	});

	it('assert without value succeeds (value is optional)', () => {
		const result = parseCommand(
			{ _: ['assert', 'e5', 'be.visible'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'assert',
			args: { ref: 'e5', chainer: 'be.visible' },
			options: {},
		});
	});

	it('rejects extra positional args for commands that do not allow joining', () => {
		expect(() => {
			parseCommand({ _: ['click', 'e5', 'extra'] }, commandRegistry);
		}).toThrow(CommandValidationError);
		expect(() => {
			parseCommand({ _: ['click', 'e5', 'extra'] }, commandRegistry);
		}).toThrow(/Too many positional arguments for "click"/);
	});

	it('rejects extra positional args for no-arg commands', () => {
		expect(() => {
			parseCommand({ _: ['back', 'extra'] }, commandRegistry);
		}).toThrow(CommandValidationError);
		expect(() => {
			parseCommand({ _: ['back', 'extra'] }, commandRegistry);
		}).toThrow(/Too many positional arguments for "back"/);
	});

	it('allows joining extra positionals for type command (text field)', () => {
		const result = parseCommand(
			{ _: ['type', 'e3', 'hello', 'world', 'foo'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'type',
			args: { ref: 'e3', text: 'hello world foo' },
			options: {},
		});
	});

	it('allows joining extra positionals for select command (value field)', () => {
		const result = parseCommand(
			{ _: ['select', 'e2', 'option', 'one'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'select',
			args: { ref: 'e2', value: 'option one' },
			options: {},
		});
	});

	it('accepts named flags for declared positionals (open --url)', () => {
		const result = parseCommand(
			{ _: ['open'], url: 'https://example.com' },
			commandRegistry,
		);
		expect(result.args).toEqual({ url: 'https://example.com' });
	});

	it('prefers positional over named flag when both are provided', () => {
		const result = parseCommand(
			{ _: ['open', 'https://positional.com'], url: 'https://flag.com' },
			commandRegistry,
		);
		expect(result.args).toEqual({ url: 'https://positional.com' });
	});

	it("parses 'run-code document.title' correctly", () => {
		const result = parseCommand(
			{ _: ['run-code', 'document.title'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'run-code',
			args: { code: 'document.title' },
			options: {},
		});
	});

	it('parses run-code with multi-word code as joined string', () => {
		const result = parseCommand(
			{ _: ['run-code', 'const', 'x', '=', '1;', 'x'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'run-code',
			args: { code: 'const x = 1; x' },
			options: {},
		});
	});

	it("parses 'eval document.title' without ref", () => {
		const result = parseCommand(
			{ _: ['eval', 'document.title'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'eval',
			args: { expression: 'document.title' },
			options: {},
		});
	});

	it("parses 'eval el => el.textContent e5' with ref", () => {
		const result = parseCommand(
			{ _: ['eval', 'el => el.textContent', 'e5'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'eval',
			args: { expression: 'el => el.textContent', ref: 'e5' },
			options: {},
		});
	});

	it("parses 'network' correctly", () => {
		const result = parseCommand({ _: ['network'] }, commandRegistry);
		expect(result).toEqual({
			command: 'network',
			args: {},
			options: {},
		});
	});

	it("parses 'intercept **/api/**' correctly", () => {
		const result = parseCommand(
			{ _: ['intercept', '**/api/**'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'intercept',
			args: { pattern: '**/api/**' },
			options: {},
		});
	});

	it('parses \'intercept **/api/** --status 200 --body {"ok":true}\' correctly', () => {
		const result = parseCommand(
			{
				_: ['intercept', '**/api/**'],
				status: 200,
				body: '{"ok":true}',
				'content-type': 'application/json',
			},
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'intercept',
			args: { pattern: '**/api/**' },
			options: {
				status: 200,
				body: '{"ok":true}',
				'content-type': 'application/json',
			},
		});
	});

	it("parses 'intercept-list' correctly", () => {
		const result = parseCommand({ _: ['intercept-list'] }, commandRegistry);
		expect(result).toEqual({
			command: 'intercept-list',
			args: {},
			options: {},
		});
	});

	it("parses 'unintercept' without pattern correctly", () => {
		const result = parseCommand({ _: ['unintercept'] }, commandRegistry);
		expect(result).toEqual({
			command: 'unintercept',
			args: {},
			options: {},
		});
	});

	it("parses 'unintercept **/api/**' with pattern correctly", () => {
		const result = parseCommand(
			{ _: ['unintercept', '**/api/**'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'unintercept',
			args: { pattern: '**/api/**' },
			options: {},
		});
	});

	it("parses 'waitforresponse **/api/articles*' correctly", () => {
		const result = parseCommand(
			{ _: ['waitforresponse', '**/api/articles*'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'waitforresponse',
			args: { pattern: '**/api/articles*' },
			options: {},
		});
	});

	it("parses 'waitforresponse **/api/** --timeout 10000' correctly", () => {
		const result = parseCommand(
			{ _: ['waitforresponse', '**/api/**'], timeout: 10000 },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'waitforresponse',
			args: { pattern: '**/api/**' },
			options: { timeout: 10000 },
		});
	});

	it("parses 'cookie-list --domain 127.0.0.1' correctly", () => {
		const result = parseCommand(
			{ _: ['cookie-list'], domain: '127.0.0.1' },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'cookie-list',
			args: {},
			options: { domain: '127.0.0.1' },
		});
	});

	it("parses 'cookie-get session' correctly", () => {
		const result = parseCommand(
			{ _: ['cookie-get', 'session'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'cookie-get',
			args: { name: 'session' },
			options: {},
		});
	});

	it("parses 'cookie-set session hello world' correctly", () => {
		const result = parseCommand(
			{
				_: ['cookie-set', 'session', 'hello', 'world'],
				domain: '127.0.0.1',
				httpOnly: true,
				secure: true,
				path: '/',
			},
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'cookie-set',
			args: { name: 'session', value: 'hello world' },
			options: {
				domain: '127.0.0.1',
				httpOnly: true,
				secure: true,
				path: '/',
			},
		});
	});

	it("parses 'cookie-delete session' correctly", () => {
		const result = parseCommand(
			{ _: ['cookie-delete', 'session'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'cookie-delete',
			args: { name: 'session' },
			options: {},
		});
	});

	it("parses 'cookie-clear' correctly", () => {
		const result = parseCommand({ _: ['cookie-clear'] }, commandRegistry);
		expect(result).toEqual({
			command: 'cookie-clear',
			args: {},
			options: {},
		});
	});

	it("parses 'localstorage-list' correctly", () => {
		const result = parseCommand(
			{ _: ['localstorage-list'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'localstorage-list',
			args: {},
			options: {},
		});
	});

	it("parses 'localstorage-get token' correctly", () => {
		const result = parseCommand(
			{ _: ['localstorage-get', 'token'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'localstorage-get',
			args: { key: 'token' },
			options: {},
		});
	});

	it("parses 'localstorage-set token abc123' correctly", () => {
		const result = parseCommand(
			{ _: ['localstorage-set', 'token', 'abc123'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'localstorage-set',
			args: { key: 'token', value: 'abc123' },
			options: {},
		});
	});

	it("parses 'localstorage-delete token' correctly", () => {
		const result = parseCommand(
			{ _: ['localstorage-delete', 'token'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'localstorage-delete',
			args: { key: 'token' },
			options: {},
		});
	});

	it("parses 'localstorage-clear' correctly", () => {
		const result = parseCommand(
			{ _: ['localstorage-clear'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'localstorage-clear',
			args: {},
			options: {},
		});
	});

	it("parses 'sessionstorage-list' correctly", () => {
		const result = parseCommand(
			{ _: ['sessionstorage-list'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'sessionstorage-list',
			args: {},
			options: {},
		});
	});

	it("parses 'sessionstorage-get sid' correctly", () => {
		const result = parseCommand(
			{ _: ['sessionstorage-get', 'sid'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'sessionstorage-get',
			args: { key: 'sid' },
			options: {},
		});
	});

	it("parses 'sessionstorage-set sid xyz' correctly", () => {
		const result = parseCommand(
			{ _: ['sessionstorage-set', 'sid', 'xyz'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'sessionstorage-set',
			args: { key: 'sid', value: 'xyz' },
			options: {},
		});
	});

	it("parses 'sessionstorage-delete sid' correctly", () => {
		const result = parseCommand(
			{ _: ['sessionstorage-delete', 'sid'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'sessionstorage-delete',
			args: { key: 'sid' },
			options: {},
		});
	});

	it("parses 'sessionstorage-clear' correctly", () => {
		const result = parseCommand(
			{ _: ['sessionstorage-clear'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'sessionstorage-clear',
			args: {},
			options: {},
		});
	});

	it("parses 'fill e3 hello world' correctly", () => {
		const result = parseCommand(
			{ _: ['fill', 'e3', 'hello', 'world'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'fill',
			args: { ref: 'e3', text: 'hello world' },
			options: {},
		});
	});

	it("parses 'dialog-accept' without text", () => {
		const result = parseCommand({ _: ['dialog-accept'] }, commandRegistry);
		expect(result).toEqual({
			command: 'dialog-accept',
			args: {},
			options: {},
		});
	});

	it("parses 'dialog-accept prompt answer' with text", () => {
		const result = parseCommand(
			{ _: ['dialog-accept', 'prompt', 'answer'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'dialog-accept',
			args: { text: 'prompt answer' },
			options: {},
		});
	});

	it("parses 'dialog-dismiss' correctly", () => {
		const result = parseCommand({ _: ['dialog-dismiss'] }, commandRegistry);
		expect(result).toEqual({
			command: 'dialog-dismiss',
			args: {},
			options: {},
		});
	});

	it("parses 'resize 1280 720' correctly", () => {
		const result = parseCommand(
			{ _: ['resize', '1280', '720'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'resize',
			args: { width: 1280, height: 720 },
			options: {},
		});
	});

	it("parses 'screenshot' without ref", () => {
		const result = parseCommand({ _: ['screenshot'] }, commandRegistry);
		expect(result).toEqual({
			command: 'screenshot',
			args: {},
			options: {},
		});
	});

	it("parses 'screenshot e5 --filename test.png' correctly", () => {
		const result = parseCommand(
			{ _: ['screenshot', 'e5'], filename: 'test.png' },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'screenshot',
			args: { ref: 'e5' },
			options: { filename: 'test.png' },
		});
	});

	it("parses 'drag e3 e5' correctly", () => {
		const result = parseCommand({ _: ['drag', 'e3', 'e5'] }, commandRegistry);
		expect(result).toEqual({
			command: 'drag',
			args: { startRef: 'e3', endRef: 'e5' },
			options: {},
		});
	});

	it("parses 'upload e3 test.pdf' correctly", () => {
		const result = parseCommand(
			{ _: ['upload', 'e3', 'test.pdf'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'upload',
			args: { ref: 'e3', file: 'test.pdf' },
			options: {},
		});
	});

	it("resolves 'close' alias to 'stop'", () => {
		const result = parseCommand({ _: ['close'] }, commandRegistry);
		expect(result).toEqual({
			command: 'stop',
			args: {},
			options: {},
		});
	});

	it("resolves 'goto' alias to 'navigate'", () => {
		const result = parseCommand(
			{ _: ['goto', 'https://example.com'] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'navigate',
			args: { url: 'https://example.com' },
			options: {},
		});
	});

	it("resolves 'go-back' alias to 'back'", () => {
		const result = parseCommand({ _: ['go-back'] }, commandRegistry);
		expect(result).toEqual({
			command: 'back',
			args: {},
			options: {},
		});
	});

	it("resolves 'go-forward' alias to 'forward'", () => {
		const result = parseCommand({ _: ['go-forward'] }, commandRegistry);
		expect(result).toEqual({
			command: 'forward',
			args: {},
			options: {},
		});
	});

	it('coerces numeric positional args to strings for type command', () => {
		// minimist parses `type e5 2` as { _: ['type', 'e5', 2] } (number)
		const result = parseCommand(
			{ _: ['type', 'e5', 2 as unknown as string] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'type',
			args: { ref: 'e5', text: '2' },
			options: {},
		});
	});

	it('coerces numeric positional args to strings for fill command', () => {
		// minimist parses `fill e5 90210` as { _: ['fill', 'e5', 90210] }
		const result = parseCommand(
			{ _: ['fill', 'e5', 90210 as unknown as string] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'fill',
			args: { ref: 'e5', text: '90210' },
			options: {},
		});
	});

	it('coerces numeric positional args to strings for assert command', () => {
		// minimist parses `assert e5 have.text 2` as { _: ['assert', 'e5', 'have.text', 2] }
		const result = parseCommand(
			{ _: ['assert', 'e5', 'have.text', 2 as unknown as string] },
			commandRegistry,
		);
		expect(result).toEqual({
			command: 'assert',
			args: { ref: 'e5', chainer: 'have.text', value: '2' },
			options: {},
		});
	});

	it('coerces numeric named flags to strings', () => {
		// `open --url 8080` would give { _: ['open'], url: 8080 }
		const result = parseCommand(
			{ _: ['open'], url: 8080 as unknown as string },
			commandRegistry,
		);
		expect(result.args).toEqual({ url: '8080' });
	});
});

describe('buildRegistry', () => {
	it('returns a new registry each call', () => {
		const r1 = buildRegistry();
		const r2 = buildRegistry();
		expect(r1).not.toBe(r2);
		expect(r1.size).toBe(r2.size);
	});

	it('every allCommands entry has a registry entry', () => {
		for (const cmd of allCommands) {
			expect(commandRegistry.has(cmd.name)).toBe(true);
		}
	});

	it('registry entries reference the correct schema', () => {
		const clickEntry = commandRegistry.get('click');
		expect(clickEntry).toBeDefined();
		expect(clickEntry!.schema).toBe(click);
		expect(clickEntry!.positionals).toEqual(['ref']);

		const typeEntry = commandRegistry.get('type');
		expect(typeEntry).toBeDefined();
		expect(typeEntry!.schema).toBe(type_);
		expect(typeEntry!.positionals).toEqual(['ref', 'text']);
	});
});
