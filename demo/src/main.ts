import { INJECTED_IIFE } from '../../dist/injected.string.js';
import { resolveRefFromMap } from '../../src/browser/refMap.js';
import {
	injectSnapshotIife,
	takeSnapshotFromWindow,
} from '../../src/browser/snapshotManager.js';

import { CommandExecutor } from './commandExecutor.js';
import { CommandQueue } from './commandQueue.js';
import { ReplController } from './replController.js';
import { getHistory, undo } from './sessionHistory.js';

const HIGHLIGHT_STYLE = '3px solid #f97316';

let clearHighlight: (() => void) | undefined;

function bootstrap(): void {
	const iframe = queryRequired<HTMLIFrameElement>('demo-iframe');
	const outputPanel = queryRequired<HTMLElement>('output-panel');
	const snapshotPanel = queryRequired<HTMLElement>('snapshot-panel');
	const codegenPanel = queryRequired<HTMLElement>('codegen-panel');
	const replForm = queryRequired<HTMLFormElement>('repl-form');
	const commandInput = queryRequired<HTMLInputElement>('command-input');
	const runButton = queryRequired<HTMLButtonElement>('run-button');
	const exportButton = queryRequired<HTMLButtonElement>('export-button');
	const pageUrl = queryRequired<HTMLElement>('page-url');
	const pageTitle = queryRequired<HTMLElement>('page-title');

	const renderSnapshot = (snapshot: string): void => {
		snapshotPanel.innerHTML = renderSnapshotMarkup(snapshot);
	};

	const queue = new CommandQueue();
	const executor = new CommandExecutor({
		iframe,
		ensureSnapshotReady: (win) => {
			injectSnapshotIife(win, INJECTED_IIFE);
		},
		getHistory,
		undoHistory: undo,
	});

	const controller = new ReplController({
		view: {
			form: replForm,
			input: commandInput,
			runButton,
			outputPanel,
			codegenPanel,
			exportButton,
			pageUrl,
			pageTitle,
		},
		queue,
		executor,
		renderSnapshot,
	});

	controller.bind();

	snapshotPanel.addEventListener('click', (event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) {
			return;
		}

		const refButton = target.closest<HTMLElement>('[data-ref]');
		if (!refButton) {
			return;
		}

		const ref = refButton.dataset.ref;
		if (!ref || !iframe.contentWindow) {
			return;
		}

		try {
			const element = resolveRefFromMap(iframe.contentWindow, ref);
			highlightElement(element);
		} catch {
			// Ref highlighting is opportunistic; stale refs should not break the demo.
		}
	});

	iframe.addEventListener('load', () => {
		if (!iframe.contentWindow) {
			return;
		}

		injectSnapshotIife(iframe.contentWindow, INJECTED_IIFE);
		const snapshot = takeSnapshotFromWindow(iframe.contentWindow, true);
		renderSnapshot(snapshot);
		pageUrl.textContent = iframe.contentWindow.location.href;
		pageTitle.textContent = iframe.contentWindow.document.title;
	});

	void waitForIframeReady(iframe).then((win) => {
		injectSnapshotIife(win, INJECTED_IIFE);
		const snapshot = takeSnapshotFromWindow(win, true);
		renderSnapshot(snapshot);
		pageUrl.textContent = win.location.href;
		pageTitle.textContent = win.document.title;
		commandInput.focus();
	});
}

function queryRequired<T extends HTMLElement>(id: string): T {
	const element = document.getElementById(id);
	if (!element) {
		throw new Error(`Missing required demo element: #${id}`);
	}
	return element as T;
}

async function waitForIframeReady(iframe: HTMLIFrameElement): Promise<Window> {
	const currentWindow = iframe.contentWindow;
	if (currentWindow && iframe.contentDocument?.readyState === 'complete') {
		return currentWindow;
	}

	return new Promise<Window>((resolve) => {
		iframe.addEventListener(
			'load',
			() => {
				resolve(queryIframeWindow(iframe));
			},
			{ once: true },
		);
	});
}

function queryIframeWindow(iframe: HTMLIFrameElement): Window {
	if (!iframe.contentWindow) {
		throw new Error('Iframe window is not available.');
	}
	return iframe.contentWindow;
}

function renderSnapshotMarkup(snapshot: string): string {
	return escapeHtml(snapshot).replace(/ref=(e\d+)/g, (_match, ref: string) => {
		return `<button type="button" class="snapshot-ref" data-ref="${ref}">ref=${ref}</button>`;
	});
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function highlightElement(element: Element): void {
	clearHighlight?.();

	if (!(element instanceof HTMLElement)) {
		return;
	}

	const previousOutline = element.style.outline;
	const previousOffset = element.style.outlineOffset;
	const previousTransition = element.style.transition;

	element.style.outline = HIGHLIGHT_STYLE;
	element.style.outlineOffset = '4px';
	element.style.transition = 'outline 160ms ease';
	element.scrollIntoView({ block: 'center', behavior: 'smooth', inline: 'nearest' });

	clearHighlight = () => {
		element.style.outline = previousOutline;
		element.style.outlineOffset = previousOffset;
		element.style.transition = previousTransition;
	};

	window.setTimeout(() => {
		clearHighlight?.();
		clearHighlight = undefined;
	}, 1800);
}

bootstrap();