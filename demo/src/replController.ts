import { generateTestFile } from '../../src/codegen/codegen.js';

import type { DemoCommand, DemoCommandResult } from './commandExecutor.js';
import { CommandExecutor } from './commandExecutor.js';
import { CommandQueue } from './commandQueue.js';
import { getHistory, recordCommand } from './sessionHistory.js';

/**
 * DOM references consumed by the REPL controller.
 */
export interface ReplView {
	form: HTMLFormElement;
	input: HTMLInputElement;
	runButton: HTMLButtonElement;
	outputPanel: HTMLElement;
	codegenPanel: HTMLElement;
	exportButton: HTMLButtonElement;
	pageUrl: HTMLElement;
	pageTitle: HTMLElement;
}

/**
 * Dependencies required by the browser demo REPL controller.
 */
export interface ReplControllerOptions {
	view: ReplView;
	queue: CommandQueue;
	executor: CommandExecutor;
	renderSnapshot: (snapshot: string) => void;
}

/**
 * Bridges the bottom-bar REPL input to the browser demo executor.
 */
export class ReplController {
	private readonly _view: ReplView;

	private readonly _queue: CommandQueue;

	private readonly _executor: CommandExecutor;

	private readonly _renderSnapshot: (snapshot: string) => void;

	private readonly _inputHistory: string[] = [];

	private _historyIndex = -1;

	private _nextCommandId = 1;

	private _currentCodegen = generateTestFile([], { format: 'ts' });

	constructor(options: ReplControllerOptions) {
		this._view = options.view;
		this._queue = options.queue;
		this._executor = options.executor;
		this._renderSnapshot = options.renderSnapshot;
	}

	/**
	 * Attach the REPL event listeners and render the initial codegen state.
	 */
	bind(): void {
		this._view.form.addEventListener('submit', (event) => {
			event.preventDefault();
			void this.runCurrentInput();
		});

		this._view.input.addEventListener('keydown', (event) => {
			switch (event.key) {
				case 'ArrowUp':
					event.preventDefault();
					this._moveThroughInputHistory(-1);
					break;
				case 'ArrowDown':
					event.preventDefault();
					this._moveThroughInputHistory(1);
					break;
				default:
					break;
			}
		});

		this._view.exportButton.addEventListener('click', () => {
			this._downloadExport();
		});

		this._renderCodegen();
	}

	/**
	 * Execute whatever is currently typed into the REPL input.
	 */
	async runCurrentInput(): Promise<void> {
		const rawInput = this._view.input.value.trim();
		if (!rawInput) {
			return;
		}

		this._appendInputHistory(rawInput);
		this._view.input.value = '';
		this._historyIndex = this._inputHistory.length;

		let command: DemoCommand;
		try {
			command = parseCommandInput(rawInput, this._nextCommandId);
			this._nextCommandId += 1;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this._appendOutput(rawInput, { success: false, error: message });
			return;
		}

		this._setPending(true);
		try {
			const result = await this._queue.enqueue(() => this._executor.execute(command));
			recordCommand(command, result);
			this._appendOutput(rawInput, result);
			this._updatePageMeta(result);
			if (result.snapshot) {
				this._renderSnapshot(result.snapshot);
			}
			this._renderCodegen();
		} finally {
			this._setPending(false);
			this._view.input.focus();
		}
	}

	private _appendInputHistory(rawInput: string): void {
		const lastEntry = this._inputHistory[this._inputHistory.length - 1];
		if (lastEntry !== rawInput) {
			this._inputHistory.push(rawInput);
		}
	}

	private _moveThroughInputHistory(direction: -1 | 1): void {
		if (this._inputHistory.length === 0) {
			return;
		}

		const nextIndex = Math.min(
			this._inputHistory.length,
			Math.max(0, this._historyIndex + direction),
		);
		this._historyIndex = nextIndex;
		this._view.input.value =
			nextIndex === this._inputHistory.length
				? ''
				: this._inputHistory[nextIndex];
	}

	private _appendOutput(rawInput: string, result: DemoCommandResult): void {
		const entry = document.createElement('article');
		entry.className = `log-entry ${result.success ? 'is-success' : 'is-error'}`;

		const commandLine = document.createElement('p');
		commandLine.className = 'log-command';
		commandLine.textContent = `$ ${rawInput}`;
		entry.append(commandLine);

		const statusLine = document.createElement('p');
		statusLine.className = 'log-status';
		statusLine.textContent = result.success ? 'Completed' : result.error ?? 'Command failed';
		entry.append(statusLine);

		if (result.cypressCommand) {
			const codeBlock = document.createElement('pre');
			codeBlock.className = 'log-code';
			codeBlock.textContent = result.cypressCommand;
			entry.append(codeBlock);
		}

		const message = result.output ?? result.evalResult;
		if (message) {
			const detail = document.createElement('pre');
			detail.className = 'log-detail';
			detail.textContent = message;
			entry.append(detail);
		}

		if (result.snapshot) {
			const snapshotHint = document.createElement('p');
			snapshotHint.className = 'log-hint';
			snapshotHint.textContent = 'Snapshot panel updated.';
			entry.append(snapshotHint);
		}

		this._view.outputPanel.append(entry);
		this._view.outputPanel.scrollTop = this._view.outputPanel.scrollHeight;
	}

	private _updatePageMeta(result: DemoCommandResult): void {
		if (result.url) {
			this._view.pageUrl.textContent = result.url;
		}
		if (result.title) {
			this._view.pageTitle.textContent = result.title;
		}
	}

	private _renderCodegen(): void {
		this._currentCodegen = generateTestFile(getHistory(), {
			format: 'ts',
		});
		this._view.codegenPanel.textContent = this._currentCodegen;
	}

	private _downloadExport(): void {
		const blob = new Blob([this._currentCodegen], {
			type: 'text/plain;charset=utf-8',
		});
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'browser-demo-export.cy.ts';
		anchor.click();
		URL.revokeObjectURL(url);
	}

	private _setPending(isPending: boolean): void {
		this._view.runButton.disabled = isPending;
		this._view.input.disabled = isPending;
		this._view.exportButton.disabled = isPending;
	}
}

/**
 * Parse a user-entered REPL string into the demo command shape.
 *
 * @param input - Raw command line from the bottom REPL bar
 * @param id - Monotonic command id for history/codegen compatibility
 * @returns Parsed command object
 */
export function parseCommandInput(input: string, id: number): DemoCommand {
	const tokens = tokenizeCommandInput(input);
	const [action, ...rest] = tokens;
	if (!action) {
		throw new Error('Enter a command to run.');
	}

	const { positionals, options } = splitOptions(rest);

	switch (action) {
		case 'click':
		case 'dblclick':
		case 'rightclick':
		case 'clear':
		case 'check':
		case 'uncheck':
		case 'focus':
		case 'blur':
		case 'hover':
		case 'waitfor':
			return withOptions(
				{
					id,
					action,
					...(positionals[0] ? { ref: positionals[0] } : {}),
				},
				options,
			);
		case 'type':
		case 'fill':
		case 'select':
			return withOptions(
				{
					id,
					action,
					...(positionals[0] ? { ref: positionals[0] } : {}),
					...(joinText(positionals.slice(1)) ? { text: joinText(positionals.slice(1)) } : {}),
				},
				options,
			);
		case 'scrollto':
			if (positionals[0] && looksLikeRef(positionals[0])) {
				return withOptions({ id, action, ref: positionals[0] }, options);
			}
			return withOptions(
				{
					id,
					action,
					...(joinText(positionals) ? { text: joinText(positionals) } : {}),
				},
				options,
			);
		case 'navigate':
		case 'press':
		case 'wait':
		case 'run-code':
			return withOptions(
				{
					id,
					action,
					...(joinText(positionals) ? { text: joinText(positionals) } : {}),
				},
				options,
			);
		case 'back':
		case 'forward':
		case 'reload':
		case 'snapshot':
		case 'history':
		case 'undo':
		case 'export':
		case 'localstorage-list':
		case 'localstorage-clear':
		case 'sessionstorage-list':
		case 'sessionstorage-clear':
		case 'cookie-list':
		case 'cookie-clear':
			return withOptions({ id, action }, options);
		case 'eval': {
			const lastToken = positionals[positionals.length - 1];
			const hasTrailingRef =
				positionals.length >= 2 &&
				lastToken !== undefined &&
				looksLikeRef(lastToken);
			const exprParts = hasTrailingRef ? positionals.slice(0, -1) : positionals;
			return withOptions(
				{
					id,
					action,
					...(joinText(exprParts) ? { text: joinText(exprParts) } : {}),
					...(hasTrailingRef ? { ref: lastToken } : {}),
				},
				options,
			);
		}
		case 'assert': {
			const [ref, second, ...restText] = positionals;
			const legacyChainer = typeof options['chainer'] === 'string' ? options['chainer'] : undefined;
			const chainer = legacyChainer ?? second;
			const valueParts = legacyChainer ? [second, ...restText] : restText;
			return withOptions(
				{
					id,
					action,
					...(ref ? { ref } : {}),
					...(joinText(valueParts) ? { text: joinText(valueParts) } : {}),
				},
				{
					...options,
					...(chainer ? { chainer } : {}),
				},
			);
		}
		case 'asserturl':
		case 'asserttitle': {
			const [chainer, ...restText] = positionals;
			const legacyChainer = typeof options['chainer'] === 'string' ? options['chainer'] : undefined;
			const finalChainer = legacyChainer ?? chainer;
			const valueParts = legacyChainer ? positionals : restText;
			return withOptions(
				{
					id,
					action,
					...(joinText(valueParts) ? { text: joinText(valueParts) } : {}),
				},
				{
					...options,
					...(finalChainer ? { chainer: finalChainer } : {}),
				},
			);
		}
		case 'cookie-get':
		case 'cookie-delete':
		case 'localstorage-get':
		case 'localstorage-delete':
		case 'sessionstorage-get':
		case 'sessionstorage-delete':
			return withOptions(
				{
					id,
					action,
					...(positionals[0] ? { text: positionals[0] } : {}),
				},
				options,
			);
		case 'cookie-set':
		case 'localstorage-set':
		case 'sessionstorage-set':
			return withOptions(
				{
					id,
					action,
					...(positionals[0] ? { text: positionals[0] } : {}),
				},
				{
					...options,
					...(joinText(positionals.slice(1)) ? { value: joinText(positionals.slice(1)) } : {}),
				},
			);
		case 'resize':
			return withOptions(
				{ id, action },
				{
					...options,
					...(positionals[0] ? { width: coerceOptionValue('width', positionals[0]) } : {}),
					...(positionals[1] ? { height: coerceOptionValue('height', positionals[1]) } : {}),
				},
			);
		default:
			return withOptions(
				{
					id,
					action,
					...(positionals[0] ? { ref: positionals[0] } : {}),
					...(joinText(positionals.slice(1)) ? { text: joinText(positionals.slice(1)) } : {}),
				},
				options,
			);
	}
}

function tokenizeCommandInput(input: string): string[] {
	const tokens: string[] = [];
	let current = '';
	let quote: 'single' | 'double' | undefined;
	let isEscaped = false;

	for (const character of input) {
		if (isEscaped) {
			current += character;
			isEscaped = false;
			continue;
		}

		if (character === '\\') {
			isEscaped = true;
			continue;
		}

		if (quote === 'single') {
			if (character === "'") {
				quote = undefined;
			} else {
				current += character;
			}
			continue;
		}

		if (quote === 'double') {
			if (character === '"') {
				quote = undefined;
			} else {
				current += character;
			}
			continue;
		}

		if (character === "'") {
			quote = 'single';
			continue;
		}

		if (character === '"') {
			quote = 'double';
			continue;
		}

		if (/\s/.test(character)) {
			if (current) {
				tokens.push(current);
				current = '';
			}
			continue;
		}

		current += character;
	}

	if (quote) {
		throw new Error('Unterminated quoted string.');
	}

	if (isEscaped) {
		current += '\\';
	}

	if (current) {
		tokens.push(current);
	}

	return tokens;
}

function splitOptions(tokens: string[]): {
	positionals: string[];
	options: Record<string, unknown>;
} {
	const positionals: string[] = [];
	const options: Record<string, unknown> = {};

	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (!token.startsWith('--')) {
			positionals.push(token);
			continue;
		}

		const rawKey = token.slice(2);
		const key = toCamelCase(rawKey);
		const nextToken = tokens[index + 1];
		if (!nextToken || nextToken.startsWith('--')) {
			options[key] = true;
			continue;
		}

		options[key] = coerceOptionValue(key, nextToken);
		index += 1;
	}

	return { positionals, options };
}

function withOptions(command: DemoCommand, options: Record<string, unknown>): DemoCommand {
	return Object.keys(options).length > 0 ? { ...command, options } : command;
}

function joinText(parts: string[]): string | undefined {
	const text = parts.join(' ').trim();
	return text.length > 0 ? text : undefined;
}

function looksLikeRef(value: string): boolean {
	return /^e\d+$/.test(value);
}

function toCamelCase(value: string): string {
	return value.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function coerceOptionValue(key: string, value: string): unknown {
	if (['timeout', 'width', 'height', 'status'].includes(key)) {
		const numeric = Number(value);
		return Number.isFinite(numeric) ? numeric : value;
	}

	if (value === 'true') {
		return true;
	}
	if (value === 'false') {
		return false;
	}

	return value;
}