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
	it('defines all 29 commands', () => {
		expect(allCommands).toHaveLength(29);
	});

	it('registers all commands in the registry', () => {
		expect(commandRegistry.size).toBe(29);
	});

	describe('categories', () => {
		it('has core commands', () => {
			expect(open.category).toBe('core');
			expect(stop.category).toBe('core');
			expect(status.category).toBe('core');
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
