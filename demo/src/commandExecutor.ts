import type { GenerateOptions } from '../../src/codegen/codegen.js';
import { generateTestFile } from '../../src/codegen/codegen.js';
import { validateElementForCommand } from '../../src/browser/commandValidation.js';
import { resolveRefFromMap } from '../../src/browser/refMap.js';
import {
	buildCypressCommand,
	generateSelector,
} from '../../src/browser/selectorGenerator.js';
import { takeSnapshotFromWindow } from '../../src/browser/snapshotManager.js';
import type { CommandResult, QueuedCommand } from '../../src/daemon/commandQueue.js';

/**
 * Command shape used by the browser demo.
 */
export type DemoCommand = QueuedCommand;

/**
 * Result shape returned by the browser demo executor.
 */
export interface DemoCommandResult extends CommandResult {
	/** Additional human-readable output for storage, history, and export commands. */
	output?: string;
}

/**
 * History entry shape consumed by export/history helpers.
 */
export interface SessionCommandRecord {
	command: DemoCommand;
	result: DemoCommandResult;
}

/**
 * Dependencies needed by the browser command executor.
 */
export interface CommandExecutorOptions {
	/** The live iframe hosting the toy app. */
	iframe: HTMLIFrameElement;
	/** Re-inject or re-check snapshot readiness after navigation. */
	ensureSnapshotReady?: (win: Window) => void | Promise<void>;
	/** Retrieve the current command history for history/export commands. */
	getHistory?: () => ReadonlyArray<SessionCommandRecord>;
	/** Remove and return the most recent history entry for undo. */
	undoHistory?: () => SessionCommandRecord | undefined;
}

interface PreparedCommand {
	command: DemoCommand;
	element?: Element;
	selector?: string;
	chainer?: string;
	cypressCommand?: string;
}

interface CommandExecutionPayload {
	snapshot?: string;
	evalResult?: string;
	output?: string;
	url: string;
	title: string;
}

class CommandExecutionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CommandExecutionError';
	}
}

class UnsupportedCommandError extends Error {
	constructor(action: string) {
		super(`Command "${action}" is available in the full CLI only.`);
		this.name = 'UnsupportedCommandError';
	}
}

const FULL_CLI_ONLY_COMMANDS = new Set([
	'intercept',
	'waitforresponse',
	'unintercept',
	'intercept-list',
	'network',
	'upload',
	'drag',
	'cyrun',
	'dialog-accept',
	'dialog-dismiss',
	'state-save',
	'state-load',
	'screenshot',
	'open',
	'stop',
	'repl',
	'install',
	'run',
	'runTest',
	'status',
	'console',
]);

const COMMANDS_REQUIRING_REF = new Set([
	'click',
	'dblclick',
	'rightclick',
	'type',
	'fill',
	'clear',
	'check',
	'uncheck',
	'select',
	'focus',
	'blur',
	'hover',
	'assert',
	'waitfor',
]);

const COMMANDS_REQUIRING_TEXT = new Set([
	'type',
	'fill',
	'select',
	'navigate',
	'press',
	'run-code',
	'eval',
	'wait',
	'cookie-get',
	'cookie-set',
	'cookie-delete',
	'localstorage-get',
	'localstorage-set',
	'localstorage-delete',
	'sessionstorage-get',
	'sessionstorage-set',
	'sessionstorage-delete',
]);

const SNAPSHOT_ACTIONS = new Set([
	'snapshot',
	'click',
	'dblclick',
	'rightclick',
	'type',
	'fill',
	'clear',
	'check',
	'uncheck',
	'select',
	'focus',
	'blur',
	'navigate',
	'back',
	'forward',
	'reload',
	'assert',
	'asserturl',
	'asserttitle',
	'run-code',
	'eval',
	'wait',
	'waitfor',
	'hover',
	'press',
	'scrollto',
	'resize',
]);

const KEY_MAP: Record<string, string> = {
	Escape: 'Escape',
	ArrowUp: 'ArrowUp',
	ArrowDown: 'ArrowDown',
	ArrowLeft: 'ArrowLeft',
	ArrowRight: 'ArrowRight',
	Delete: 'Delete',
	' ': ' ',
	PageUp: 'PageUp',
	PageDown: 'PageDown',
	Enter: 'Enter',
	Tab: 'Tab',
};

/**
 * Browser-only command executor used by the demo REPL.
 */
export class CommandExecutor {
	private readonly _iframe: HTMLIFrameElement;

	private readonly _ensureSnapshotReady?: (win: Window) => void | Promise<void>;

	private readonly _getHistory?: () => ReadonlyArray<SessionCommandRecord>;

	private readonly _undoHistory?: () => SessionCommandRecord | undefined;

	constructor(options: CommandExecutorOptions) {
		this._iframe = options.iframe;
		this._ensureSnapshotReady = options.ensureSnapshotReady;
		this._getHistory = options.getHistory;
		this._undoHistory = options.undoHistory;
	}

	/**
	 * Execute a parsed browser-demo command against the iframe document.
	 *
	 * @param command - The parsed command object from the REPL
	 * @returns The command result, including snapshot/codegen metadata when applicable
	 */
	async execute(command: DemoCommand): Promise<DemoCommandResult> {
		let win = this._getWindow();
		await this._ensureSnapshot(win);

		let prepared: PreparedCommand | undefined;

		try {
			if (FULL_CLI_ONLY_COMMANDS.has(command.action)) {
				throw new UnsupportedCommandError(command.action);
			}

			prepared = this._prepareCommand(command, win);
			const payload = await this._executePreparedCommand(prepared, win);

			return {
				success: true,
				selector: prepared.selector,
				cypressCommand: prepared.cypressCommand,
				snapshot: payload.snapshot,
				evalResult: payload.evalResult,
				output: payload.output,
				url: payload.url,
				title: payload.title,
			};
		} catch (error) {
			win = this._iframe.contentWindow ?? win;
			const message = error instanceof Error ? error.message : String(error);
			const url = this._safeUrl(win);
			const title = this._safeTitle(win);
			const snapshot = SNAPSHOT_ACTIONS.has(command.action)
				? this._takeSnapshot(win, command.action === 'snapshot')
				: undefined;

			return {
				success: false,
				error: message,
				selector: prepared?.selector,
				cypressCommand: prepared?.cypressCommand,
				snapshot,
				url,
				title,
			};
		}
	}

	private _prepareCommand(command: DemoCommand, win: Window): PreparedCommand {
		this._validateCommand(command);

		const chainer =
			typeof command.options?.['chainer'] === 'string'
				? (command.options['chainer'] as string)
				: undefined;

		const element = command.ref
			? this._resolveCommandElement(win, command.ref, command.action)
			: undefined;

		if (element) {
			const validationError = validateElementForCommand(element, command.action);
			if (validationError) {
				throw new CommandExecutionError(validationError);
			}
		}

		const selector = element ? generateSelector(element) : undefined;
		const cypressCommand = this._buildCypressCommand(command, selector, chainer);

		return {
			command,
			element,
			selector,
			chainer,
			cypressCommand,
		};
	}

	private async _executePreparedCommand(
		prepared: PreparedCommand,
		win: Window,
	): Promise<CommandExecutionPayload> {
		const { command, element, chainer } = prepared;
		let nextWindow = win;
		let output: string | undefined;
		let evalResult: string | undefined;

		switch (command.action) {
			case 'snapshot':
				break;
			case 'click':
				this._clickElement(element!);
				break;
			case 'dblclick':
				this._dispatchMouseEvent(element!, 'dblclick', nextWindow);
				break;
			case 'rightclick':
				this._dispatchMouseEvent(element!, 'contextmenu', nextWindow, 2);
				break;
			case 'type':
				this._typeIntoElement(element!, command.text!, nextWindow);
				break;
			case 'fill':
				this._clearElementValue(element!);
				this._typeIntoElement(element!, command.text!, nextWindow);
				break;
			case 'clear':
				this._clearElementValue(element!);
				break;
			case 'check':
				this._setCheckedState(element!, true);
				break;
			case 'uncheck':
				this._setCheckedState(element!, false);
				break;
			case 'select':
				this._selectOption(element!, command.text!);
				break;
			case 'focus':
				(element as HTMLElement).focus();
				break;
			case 'blur':
				(element as HTMLElement).blur();
				break;
			case 'hover':
				this._dispatchMouseEvent(element!, 'mouseover', nextWindow);
				break;
			case 'navigate':
				nextWindow = await this._navigate(command.text!);
				break;
			case 'back':
				nextWindow = await this._goHistory('back');
				break;
			case 'forward':
				nextWindow = await this._goHistory('forward');
				break;
			case 'reload':
				nextWindow = await this._reloadFrame();
				break;
			case 'assert': {
				const error = this._applyElementChainer(chainer!, element!, command.text);
				if (error) {
					throw new CommandExecutionError(error);
				}
				break;
			}
			case 'asserturl': {
				const error = this._applyChainer(
					chainer!,
					this._safeUrl(nextWindow),
					command.text,
				);
				if (error) {
					throw new CommandExecutionError(error);
				}
				break;
			}
			case 'asserttitle': {
				const error = this._applyChainer(
					chainer!,
					this._safeTitle(nextWindow),
					command.text,
				);
				if (error) {
					throw new CommandExecutionError(error);
				}
				break;
			}
			case 'run-code': {
				const result = this._evaluate(nextWindow, command.text!);
				if (result !== undefined) {
					evalResult = String(result);
				}
				break;
			}
			case 'eval': {
				const result = command.ref
					? this._evaluateOnElement(nextWindow, command.text!, element!)
					: this._evaluate(nextWindow, command.text!);
				evalResult = safeJsonSerialize(result);
				break;
			}
			case 'wait':
				await delay(Number(command.text) || 0);
				break;
			case 'waitfor':
				await this._waitForElement(element!, Number(command.options?.['timeout'] ?? 2000));
				break;
			case 'localstorage-list':
				evalResult = JSON.stringify(this._listStorage(nextWindow.localStorage));
				break;
			case 'localstorage-get':
				evalResult = JSON.stringify(
					this._getStorageValue(nextWindow.localStorage, 'localStorage', command.text!),
				);
				break;
			case 'localstorage-set':
				evalResult = JSON.stringify(
					this._setStorageValue(
						nextWindow.localStorage,
						command.text!,
						String(command.options?.['value'] ?? ''),
					),
				);
				break;
			case 'localstorage-delete':
				evalResult = JSON.stringify(
					this._deleteStorageValue(nextWindow.localStorage, 'localStorage', command.text!),
				);
				break;
			case 'localstorage-clear':
				evalResult = JSON.stringify(this._clearStorage(nextWindow.localStorage));
				break;
			case 'sessionstorage-list':
				evalResult = JSON.stringify(this._listStorage(nextWindow.sessionStorage));
				break;
			case 'sessionstorage-get':
				evalResult = JSON.stringify(
					this._getStorageValue(nextWindow.sessionStorage, 'sessionStorage', command.text!),
				);
				break;
			case 'sessionstorage-set':
				evalResult = JSON.stringify(
					this._setStorageValue(
						nextWindow.sessionStorage,
						command.text!,
						String(command.options?.['value'] ?? ''),
					),
				);
				break;
			case 'sessionstorage-delete':
				evalResult = JSON.stringify(
					this._deleteStorageValue(nextWindow.sessionStorage, 'sessionStorage', command.text!),
				);
				break;
			case 'sessionstorage-clear':
				evalResult = JSON.stringify(this._clearStorage(nextWindow.sessionStorage));
				break;
			case 'cookie-list':
				evalResult = JSON.stringify(this._listCookies(nextWindow.document));
				break;
			case 'cookie-get':
				evalResult = JSON.stringify(this._getCookie(nextWindow.document, command.text!));
				break;
			case 'cookie-set':
				evalResult = JSON.stringify(
					this._setCookie(nextWindow.document, command.text!, String(command.options?.['value'] ?? ''), command.options),
				);
				break;
			case 'cookie-delete':
				evalResult = JSON.stringify(this._deleteCookie(nextWindow.document, command.text!));
				break;
			case 'cookie-clear':
				evalResult = JSON.stringify(this._clearCookies(nextWindow.document));
				break;
			case 'scrollto':
				this._scrollTo(preparedCommandTarget(prepared), command.text, nextWindow);
				break;
			case 'press':
				this._pressKey(nextWindow, command.text!);
				break;
			case 'resize':
				this._resizeFrame(command.options);
				break;
			case 'history':
				output = JSON.stringify(this._formatHistory(), null, 2);
				break;
			case 'undo': {
				const removed = this._undoHistory?.();
				output = removed
					? `Removed ${formatCommand(removed.command)} from history.`
					: 'History is already empty.';
				break;
			}
			case 'export': {
				const generated = generateTestFile(
					this._getHistory?.() ?? [],
					this._buildExportOptions(command.options),
				);
				output = generated;
				evalResult = generated;
				break;
			}
			default:
				throw new UnsupportedCommandError(command.action);
		}

		const snapshot = SNAPSHOT_ACTIONS.has(command.action)
			? this._takeSnapshot(nextWindow, shouldCaptureFullTree(command.action))
			: undefined;

		return {
			snapshot,
			evalResult,
			output,
			url: this._safeUrl(nextWindow),
			title: this._safeTitle(nextWindow),
		};
	}

	private _validateCommand(command: DemoCommand): void {
		if (COMMANDS_REQUIRING_REF.has(command.action) && !command.ref) {
			throw new CommandExecutionError(
				'Missing required argument: ref. Use a snapshot ref such as "e5".',
			);
		}

		if (COMMANDS_REQUIRING_TEXT.has(command.action) && !command.text) {
			throw new CommandExecutionError(
				`Missing required argument: ${requiredTextFieldName(command.action)}.`,
			);
		}

		if (command.action === 'assert' && !command.options?.['chainer']) {
			throw new CommandExecutionError('Missing required argument: chainer.');
		}

		if ((command.action === 'asserturl' || command.action === 'asserttitle') && !command.options?.['chainer']) {
			throw new CommandExecutionError('Missing required argument: chainer.');
		}

		if (command.action === 'resize') {
			if (command.options?.['width'] === undefined) {
				throw new CommandExecutionError('Missing required argument: width.');
			}
			if (command.options?.['height'] === undefined) {
				throw new CommandExecutionError('Missing required argument: height.');
			}
		}

		if (command.action === 'cookie-set' || command.action === 'localstorage-set' || command.action === 'sessionstorage-set') {
			if (command.options?.['value'] === undefined) {
				throw new CommandExecutionError('Missing required argument: value.');
			}
		}
	}

	private _resolveCommandElement(
		win: Window,
		ref: string,
		action: string,
	): Element {
		const resolved = resolveRefFromMap(win, ref);
		if (action === 'select' && !isSelectElement(resolved)) {
			const nestedSelect = resolved.querySelector('select');
			if (nestedSelect) {
				return nestedSelect;
			}
		}
		return resolved;
	}

	private _buildCypressCommand(
		command: DemoCommand,
		selector?: string,
		chainer?: string,
	): string | undefined {
		if (command.action === 'history' || command.action === 'undo' || command.action === 'export') {
			return undefined;
		}

		return buildCypressCommand(
			selector,
			command.action,
			command.text,
			chainer,
			command.options,
		);
	}

	private _clickElement(element: Element): void {
		const htmlElement = element as HTMLElementLike;
		if (typeof htmlElement.click === 'function') {
			htmlElement.click();
			return;
		}

		element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	}

	private _dispatchMouseEvent(
		element: Element,
		type: string,
		win: Window,
		button = 0,
	): void {
		element.dispatchEvent(
			new win.MouseEvent(type, {
				bubbles: true,
				cancelable: true,
				button,
			}),
		);
	}

	private _typeIntoElement(element: Element, text: string, win: Window): void {
		const target = element as HTMLElement;
		target.focus();

		for (const character of text) {
			dispatchKeyEvents(target, character, win);

			if (isTextEntryElement(element)) {
				const selectionStart = element.selectionStart ?? element.value.length;
				const selectionEnd = element.selectionEnd ?? element.value.length;
				element.setRangeText(character, selectionStart, selectionEnd, 'end');
				dispatchInputEvents(element, win);
				continue;
			}

			if (target.isContentEditable) {
				target.textContent = `${target.textContent ?? ''}${character}`;
				dispatchInputEvents(target, win);
			}
		}
	}

	private _clearElementValue(element: Element): void {
		if (isTextEntryElement(element)) {
			element.value = '';
			dispatchInputEvents(element, element.ownerDocument.defaultView ?? window);
			return;
		}

		if ((element as HTMLElement).isContentEditable) {
			(element as HTMLElement).textContent = '';
			dispatchInputEvents(
				element as HTMLElement,
				element.ownerDocument.defaultView ?? window,
			);
		}
	}

	private _setCheckedState(element: Element, checked: boolean): void {
		const input = element as HTMLInputElement;
		if (input.checked === checked) {
			return;
		}

		input.checked = checked;
		const win = element.ownerDocument.defaultView ?? window;
		input.dispatchEvent(new win.Event('input', { bubbles: true }));
		input.dispatchEvent(new win.Event('change', { bubbles: true }));
	}

	private _selectOption(element: Element, value: string): void {
		const select = element as HTMLSelectElement;
		const option = Array.from(select.options).find((candidate) => candidate.value === value);
		if (!option) {
			throw new CommandExecutionError(`Option "${value}" not found in select.`);
		}

		select.value = value;
		const win = element.ownerDocument.defaultView ?? window;
		select.dispatchEvent(new win.Event('input', { bubbles: true }));
		select.dispatchEvent(new win.Event('change', { bubbles: true }));
	}

	private async _navigate(url: string): Promise<Window> {
		const loadPromise = this._waitForIframeLoad();
		this._getWindow().location.href = resolveNavigationUrl(
			this._getWindow().location.href,
			url,
		);
		const nextWindow = await loadPromise;
		await this._ensureSnapshot(nextWindow);
		return nextWindow;
	}

	private async _goHistory(direction: 'back' | 'forward'): Promise<Window> {
		const loadPromise = this._waitForIframeLoad();
		this._getWindow().history[direction]();
		const nextWindow = await loadPromise;
		await this._ensureSnapshot(nextWindow);
		return nextWindow;
	}

	private async _reloadFrame(): Promise<Window> {
		const loadPromise = this._waitForIframeLoad();
		this._getWindow().location.reload();
		const nextWindow = await loadPromise;
		await this._ensureSnapshot(nextWindow);
		return nextWindow;
	}

	private _applyChainer(
		chainer: string,
		actual: string,
		expected?: string,
	): string | undefined {
		switch (chainer) {
			case 'equal':
			case 'eq':
				return actual !== expected
					? `Expected "${expected}" but got "${actual}"`
					: undefined;
			case 'not.equal':
				return actual === expected
					? `Expected value to not equal "${expected}"`
					: undefined;
			case 'include':
			case 'contain':
			case 'contain.text':
			case 'contains':
				return expected && !actual.includes(expected)
					? `Expected "${actual}" to include "${expected}"`
					: undefined;
			case 'not.include':
			case 'not.contain':
				return expected && actual.includes(expected)
					? `Expected "${actual}" to not include "${expected}"`
					: undefined;
			case 'have.text':
				return actual.trim() !== (expected ?? '').trim()
					? `Expected text to be "${expected}" but got "${actual}"`
					: undefined;
			case 'match':
				return expected && !new RegExp(expected).test(actual)
					? `Expected "${actual}" to match /${expected}/`
					: undefined;
			default:
				return `Unsupported chainer: "${chainer}"`;
		}
	}

	private _applyElementChainer(
		chainer: string,
		element: Element,
		expected?: string,
	): string | undefined {
		const htmlElement = element as HTMLElement;

		switch (chainer) {
			case 'have.value': {
				if (expected === undefined) {
					return 'The "have.value" chainer requires an expected value.';
				}
				const actual = 'value' in htmlElement ? String((htmlElement as HTMLInputElement).value ?? '') : '';
				return actual !== expected
					? `Expected value "${expected}" but got "${actual}"`
					: undefined;
			}
			case 'be.visible':
				return isVisible(htmlElement) ? undefined : 'Expected element to be visible';
			case 'not.be.visible':
				return isVisible(htmlElement) ? 'Expected element to not be visible' : undefined;
			case 'be.checked':
				return (htmlElement as HTMLInputElement).checked ? undefined : 'Expected element to be checked';
			case 'not.be.checked':
				return (htmlElement as HTMLInputElement).checked ? 'Expected element to not be checked' : undefined;
			case 'be.disabled':
				return (htmlElement as HTMLInputElement | HTMLButtonElement).disabled
					? undefined
					: 'Expected element to be disabled';
			case 'be.enabled':
				return (htmlElement as HTMLInputElement | HTMLButtonElement).disabled
					? 'Expected element to be enabled'
					: undefined;
			case 'be.empty': {
				const value = 'value' in htmlElement ? String((htmlElement as HTMLInputElement).value ?? '') : '';
				const text = htmlElement.textContent ?? '';
				return value !== '' || text !== '' ? 'Expected element to be empty' : undefined;
			}
			case 'have.attr':
				return this._assertAttribute(htmlElement, expected);
			case 'have.class':
				return !expected
					? 'have.class requires a class name'
					: htmlElement.classList.contains(expected)
						? undefined
						: `Expected element to have class "${expected}" but it has "${htmlElement.className}"`;
			case 'have.length': {
				if (expected === undefined) {
					return 'have.length requires an expected length value';
				}
				const length = 1;
				const numericExpected = Number(expected);
				if (Number.isNaN(numericExpected)) {
					return `have.length requires a numeric value, got "${expected}"`;
				}
				return length !== numericExpected
					? `Expected length ${expected} but got ${length}`
					: undefined;
			}
			default:
				return this._applyChainer(chainer, htmlElement.textContent ?? '', expected);
		}
	}

	private _assertAttribute(element: HTMLElement, expected?: string): string | undefined {
		if (!expected) {
			return 'have.attr requires an attribute name';
		}

		const equalsIndex = expected.indexOf('=');
		const spaceIndex = expected.indexOf(' ');
		const separatorIndex =
			equalsIndex > 0 && equalsIndex < expected.length - 1 ? equalsIndex : spaceIndex;

		if (separatorIndex === -1) {
			return element.getAttribute(expected) === null
				? `Expected element to have attribute "${expected}"`
				: undefined;
		}

		const attributeName = expected.slice(0, separatorIndex);
		const attributeValue = expected.slice(separatorIndex + 1);
		const actualValue = element.getAttribute(attributeName);

		if (actualValue === null) {
			return `Expected element to have attribute "${attributeName}"`;
		}

		return actualValue !== attributeValue
			? `Expected attribute "${attributeName}" to be "${attributeValue}" but got "${actualValue}"`
			: undefined;
	}

	private _evaluate(win: Window, code: string): unknown {
		const evalFn = (win as Window & { eval: (source: string) => unknown }).eval;
		return evalFn.call(win, code);
	}

	private _evaluateOnElement(win: Window, expression: string, element: Element): unknown {
		const fn = this._evaluate(win, `(${expression})`);
		return typeof fn === 'function' ? (fn as (target: Element) => unknown)(element) : fn;
	}

	private async _waitForElement(element: Element, timeout: number): Promise<void> {
		const startedAt = Date.now();
		while (Date.now() - startedAt <= timeout) {
			if (element.isConnected) {
				return;
			}
			await delay(50);
		}

		throw new CommandExecutionError(`Timed out waiting for ${describeElement(element)} to exist.`);
	}

	private _listStorage(storage: Storage): Record<string, string> {
		const entries: Record<string, string> = {};
		for (let index = 0; index < storage.length; index += 1) {
			const key = storage.key(index);
			if (key !== null) {
				entries[key] = storage.getItem(key) ?? '';
			}
		}
		return entries;
	}

	private _getStorageValue(
		storage: Storage,
		label: 'localStorage' | 'sessionStorage',
		key: string,
	): { key: string; value: string } {
		const value = storage.getItem(key);
		if (value === null) {
			throw new CommandExecutionError(`${label} key "${key}" not found.`);
		}
		return { key, value };
	}

	private _setStorageValue(
		storage: Storage,
		key: string,
		value: string,
	): { key: string; value: string } {
		storage.setItem(key, value);
		return { key, value };
	}

	private _deleteStorageValue(
		storage: Storage,
		label: 'localStorage' | 'sessionStorage',
		key: string,
	): { key: string; deleted: true } {
		if (storage.getItem(key) === null) {
			throw new CommandExecutionError(`${label} key "${key}" not found.`);
		}

		storage.removeItem(key);
		return { key, deleted: true };
	}

	private _clearStorage(storage: Storage): { cleared: number } {
		const cleared = storage.length;
		storage.clear();
		return { cleared };
	}

	private _listCookies(document: Document): Array<{ name: string; value: string }> {
		return parseCookies(document.cookie);
	}

	private _getCookie(
		document: Document,
		name: string,
	): { name: string; value: string } {
		const cookie = parseCookies(document.cookie).find((entry) => entry.name === name);
		if (!cookie) {
			throw new CommandExecutionError(`Cookie "${name}" not found.`);
		}
		return cookie;
	}

	private _setCookie(
		document: Document,
		name: string,
		value: string,
		options?: Record<string, unknown>,
	): { name: string; value: string } {
		const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
		const path = typeof options?.['path'] === 'string' ? options['path'] : '/';
		parts.push(`path=${path}`);
		if (typeof options?.['domain'] === 'string') {
			parts.push(`domain=${options['domain']}`);
		}
		if (options?.['secure'] === true) {
			parts.push('secure');
		}
		document.cookie = parts.join('; ');
		return { name, value };
	}

	private _deleteCookie(
		document: Document,
		name: string,
	): { name: string; cleared: true } {
		const cookie = parseCookies(document.cookie).find((entry) => entry.name === name);
		if (!cookie) {
			throw new CommandExecutionError(`Cookie "${name}" not found.`);
		}
		document.cookie = `${encodeURIComponent(name)}=; Max-Age=0; path=/`;
		return { name, cleared: true };
	}

	private _clearCookies(document: Document): { cleared: number } {
		const cookies = parseCookies(document.cookie);
		for (const cookie of cookies) {
			document.cookie = `${encodeURIComponent(cookie.name)}=; Max-Age=0; path=/`;
		}
		return { cleared: cookies.length };
	}

	private _scrollTo(target: Element | Window, position: string | undefined, win: Window): void {
		if (target instanceof Element) {
			target.scrollIntoView({ block: 'center', inline: 'nearest' });
			return;
		}

		const value = (position ?? 'top').trim().toLowerCase();
		switch (value) {
			case 'top':
				target.scrollTo({ top: 0, behavior: 'auto' });
				break;
			case 'bottom':
				target.scrollTo({ top: target.document.body.scrollHeight, behavior: 'auto' });
				break;
			case 'center':
				target.scrollTo({ top: target.document.body.scrollHeight / 2, behavior: 'auto' });
				break;
			default: {
				const coords = value.split(/[ ,]+/).map((part) => Number(part));
				if (coords.length === 2 && coords.every((part) => Number.isFinite(part))) {
					target.scrollTo(coords[0], coords[1]);
					break;
				}
				throw new CommandExecutionError(
					'Unsupported scroll position. Use a ref, top, bottom, center, or two numeric coordinates.',
				);
			}
		}
		void win;
	}

	private _pressKey(win: Window, key: string): void {
		const target = (win.document.activeElement as HTMLElement | null) ?? win.document.body;
		const resolvedKey = KEY_MAP[key] ?? key;
		target.dispatchEvent(new win.KeyboardEvent('keydown', { key: resolvedKey, bubbles: true }));
		target.dispatchEvent(new win.KeyboardEvent('keypress', { key: resolvedKey, bubbles: true }));
		target.dispatchEvent(new win.KeyboardEvent('keyup', { key: resolvedKey, bubbles: true }));
	}

	private _resizeFrame(options?: Record<string, unknown>): void {
		const width = Number(options?.['width']);
		const height = Number(options?.['height']);
		if (!Number.isFinite(width) || !Number.isFinite(height)) {
			throw new CommandExecutionError('resize requires numeric width and height values.');
		}

		this._iframe.width = String(width);
		this._iframe.height = String(height);
		this._iframe.style.width = `${width}px`;
		this._iframe.style.height = `${height}px`;
	}

	private _formatHistory(): Array<Record<string, unknown>> {
		return (this._getHistory?.() ?? []).map((entry, index) => ({
			index,
			action: entry.command.action,
			ref: entry.command.ref,
			text: entry.command.text,
			success: entry.result.success,
			cypressCommand: entry.result.cypressCommand,
			url: entry.result.url,
		}));
	}

	private _buildExportOptions(options?: Record<string, unknown>): GenerateOptions {
		const format = options?.['format'];
		return {
			...(format === 'ts' || format === 'js' ? { format } : {}),
			...(typeof options?.['describe'] === 'string'
				? { describeName: options['describe'] }
				: {}),
			...(typeof options?.['it'] === 'string' ? { itName: options['it'] } : {}),
			...(typeof options?.['baseUrl'] === 'string'
				? { baseUrl: options['baseUrl'] }
				: {}),
		};
	}

	private _getWindow(): Window {
		const win = this._iframe.contentWindow;
		if (!win) {
			throw new CommandExecutionError('Iframe window is not ready yet. Wait for the page to finish loading.');
		}
		return win;
	}

	private async _ensureSnapshot(win: Window): Promise<void> {
		await this._ensureSnapshotReady?.(win);
	}

	private _takeSnapshot(win: Window, fullTree: boolean): string {
		return takeSnapshotFromWindow(win, fullTree);
	}

	private async _waitForIframeLoad(timeout = 5000): Promise<Window> {
		return new Promise<Window>((resolve, reject) => {
			const timer = window.setTimeout(() => {
				cleanup();
				reject(new CommandExecutionError('Timed out waiting for iframe navigation to finish.'));
			}, timeout);

			const onLoad = (): void => {
				cleanup();
				const win = this._iframe.contentWindow;
				if (!win) {
					reject(new CommandExecutionError('Iframe window is not available after navigation.'));
					return;
				}
				resolve(win);
			};

			const cleanup = (): void => {
				window.clearTimeout(timer);
				this._iframe.removeEventListener('load', onLoad);
			};

			this._iframe.addEventListener('load', onLoad, { once: true });
		});
	}

	private _safeUrl(win: Window): string {
		try {
			return win.location.href;
		} catch {
			return this._iframe.src;
		}
	}

	private _safeTitle(win: Window): string {
		try {
			return win.document.title;
		} catch {
			return '';
		}
	}
}

function dispatchKeyEvents(target: HTMLElement, character: string, win: Window): void {
	target.dispatchEvent(new win.KeyboardEvent('keydown', { key: character, bubbles: true }));
	target.dispatchEvent(new win.KeyboardEvent('keypress', { key: character, bubbles: true }));
	target.dispatchEvent(new win.KeyboardEvent('keyup', { key: character, bubbles: true }));
}

function dispatchInputEvents(target: HTMLElement, win: Window): void {
	target.dispatchEvent(new win.Event('input', { bubbles: true }));
	target.dispatchEvent(new win.Event('change', { bubbles: true }));
}

function parseCookies(cookieString: string): Array<{ name: string; value: string }> {
	if (!cookieString.trim()) {
		return [];
	}

	return cookieString
		.split(';')
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			const separatorIndex = entry.indexOf('=');
			if (separatorIndex === -1) {
				return { name: decodeURIComponent(entry), value: '' };
			}

			return {
				name: decodeURIComponent(entry.slice(0, separatorIndex)),
				value: decodeURIComponent(entry.slice(separatorIndex + 1)),
			};
		});
}

function isVisible(element: HTMLElement): boolean {
	const style = element.ownerDocument.defaultView?.getComputedStyle(element);
	const rect = element.getBoundingClientRect();
	return Boolean(
		style &&
		style.display !== 'none' &&
		style.visibility !== 'hidden' &&
		style.opacity !== '0' &&
		rect.width > 0 &&
		rect.height > 0,
	);
}

function describeElement(element: Element): string {
	if (isHtmlElement(element)) {
		const role = element.getAttribute('role');
		const label = element.getAttribute('aria-label') ?? element.textContent?.trim();
		return role && label ? `${role} "${label}"` : `<${element.tagName.toLowerCase()}>`;
	}
	return element.tagName.toLowerCase();
}

function requiredTextFieldName(action: string): string {
	switch (action) {
		case 'navigate':
			return 'url';
		case 'wait':
			return 'ms';
		case 'press':
			return 'key';
		case 'cookie-get':
		case 'cookie-set':
		case 'cookie-delete':
			return 'name';
		case 'localstorage-get':
		case 'localstorage-set':
		case 'localstorage-delete':
		case 'sessionstorage-get':
		case 'sessionstorage-set':
		case 'sessionstorage-delete':
			return 'key';
		default:
			return 'text';
	}
}

function shouldCaptureFullTree(action: string): boolean {
	return (
		action === 'snapshot' ||
		action === 'navigate' ||
		action === 'back' ||
		action === 'forward' ||
		action === 'reload'
	);
}

function formatCommand(command: DemoCommand): string {
	return [command.action, command.ref, command.text].filter(Boolean).join(' ');
}

function preparedCommandTarget(prepared: PreparedCommand): Element | Window {
	return prepared.element ?? window;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		window.setTimeout(resolve, ms);
	});
}

function safeJsonSerialize(value: unknown): string {
	if (value === undefined) return 'undefined';
	if (value === null) return 'null';
	if (typeof value === 'function') return `[Function: ${value.name || 'anonymous'}]`;
	if (typeof value === 'symbol') return value.toString();
	if (typeof value === 'bigint') return `${value.toString()}n`;

	try {
		return JSON.stringify(value, (_key, current) => {
			if (typeof current === 'bigint') return `${current.toString()}n`;
			if (typeof current === 'function') return `[Function: ${current.name || 'anonymous'}]`;
			if (typeof current === 'symbol') return current.toString();
			if (isSerializedHtmlElement(current)) return `[HTMLElement: <${current.tagName.toLowerCase()}>]`;
			if (isSerializedNode(current)) return `[Node: ${current.nodeName}]`;
			return current;
		});
	} catch {
		return String(value);
	}
}

interface HTMLElementLike extends Element {
	click?: () => void;
}

function isHtmlElement(element: Element): element is HTMLElement {
	return typeof (element as HTMLElement).focus === 'function';
}

function isTextEntryElement(
	element: Element,
): element is HTMLInputElement | HTMLTextAreaElement {
	return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';
}

function isSelectElement(element: Element): element is HTMLSelectElement {
	return element.tagName === 'SELECT';
}

function isSerializedHtmlElement(value: unknown): value is { tagName: string } {
	return (
		typeof value === 'object' &&
		value !== null &&
		'tagName' in value &&
		typeof (value as { tagName?: unknown }).tagName === 'string'
	);
}

function isSerializedNode(value: unknown): value is { nodeName: string } {
	return (
		typeof value === 'object' &&
		value !== null &&
		'nodeName' in value &&
		typeof (value as { nodeName?: unknown }).nodeName === 'string'
	);
}

function resolveNavigationUrl(currentUrl: string, target: string): string {
	try {
		const absoluteTarget = new URL(target);
		return absoluteTarget.href;
	} catch {
		const baseUrl = new URL(currentUrl);
		const pathSegments = baseUrl.pathname.split('/').filter(Boolean);
		if (
			!baseUrl.pathname.endsWith('/') &&
			!baseUrl.pathname.split('/').pop()?.includes('.') &&
			pathSegments.length <= 1
		) {
			baseUrl.pathname = `${baseUrl.pathname}/`;
		}
		return new URL(target, baseUrl).href;
	}
}