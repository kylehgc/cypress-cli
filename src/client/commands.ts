import { z } from 'zod';

import { declareCommand, type CommandRegistryEntry } from './command.js';

// ---------------------------------------------------------------------------
// Core commands
// ---------------------------------------------------------------------------

export const open = declareCommand({
	name: 'open',
	category: 'core',
	description: 'Start a session: launch Cypress, navigate to URL',
	args: z.object({
		url: z.string().optional().describe('URL to open'),
	}),
	options: z.object({
		browser: z
			.string()
			.optional()
			.describe('Browser to use (e.g., "chrome", "electron")'),
		headed: z.boolean().optional().describe('Run in headed mode'),
		config: z.string().optional().describe('Path to Cypress config file'),
		resume: z.string().optional().describe('Resume a persisted session by ID'),
		'snapshot-dir': z
			.string()
			.optional()
			.describe('Directory to save snapshot YAML files'),
	}),
});

export const stop = declareCommand({
	name: 'stop',
	category: 'core',
	description: 'Stop the current session',
	args: z.object({}),
	options: z.object({}),
});

export const status = declareCommand({
	name: 'status',
	category: 'core',
	description: 'Check if a session is running',
	args: z.object({}),
	options: z.object({}),
});

export const install = declareCommand({
	name: 'install',
	category: 'core',
	description: 'Install bundled AI agent skills into the current project',
	args: z.object({}),
	options: z.object({
		skills: z.literal(true).describe('Copy the packaged SKILL files'),
	}),
});

export const snapshot = declareCommand({
	name: 'snapshot',
	category: 'core',
	description: 'Get current aria snapshot of the page',
	args: z.object({}),
	options: z.object({
		diff: z
			.boolean()
			.optional()
			.describe('Return incremental diff from last snapshot'),
		filename: z
			.string()
			.optional()
			.describe('Save snapshot to a specific file path'),
	}),
});

// ---------------------------------------------------------------------------
// Navigation commands
// ---------------------------------------------------------------------------

export const navigate = declareCommand({
	name: 'navigate',
	category: 'navigation',
	description: 'Navigate to a URL',
	args: z.object({
		url: z.string().describe('URL to navigate to'),
	}),
	options: z.object({
		timeout: z.number().optional().describe('Navigation timeout in ms'),
	}),
});

export const back = declareCommand({
	name: 'back',
	category: 'navigation',
	description: 'Go back',
	args: z.object({}),
	options: z.object({}),
});

export const forward = declareCommand({
	name: 'forward',
	category: 'navigation',
	description: 'Go forward',
	args: z.object({}),
	options: z.object({}),
});

export const reload = declareCommand({
	name: 'reload',
	category: 'navigation',
	description: 'Reload page',
	args: z.object({}),
	options: z.object({}),
});

// ---------------------------------------------------------------------------
// Interaction commands
// ---------------------------------------------------------------------------

export const click = declareCommand({
	name: 'click',
	category: 'interaction',
	description: 'Click an element by ref',
	args: z.object({
		ref: z.string().describe('Element ref from aria snapshot (e.g., "e5")'),
	}),
	options: z.object({
		force: z
			.boolean()
			.optional()
			.describe('Force click, disabling actionability checks'),
		multiple: z.boolean().optional().describe('Click multiple elements'),
	}),
});

export const dblclick = declareCommand({
	name: 'dblclick',
	category: 'interaction',
	description: 'Double-click an element by ref',
	args: z.object({
		ref: z.string().describe('Element ref from aria snapshot (e.g., "e5")'),
	}),
	options: z.object({
		force: z
			.boolean()
			.optional()
			.describe('Force double-click, disabling actionability checks'),
	}),
});

export const rightclick = declareCommand({
	name: 'rightclick',
	category: 'interaction',
	description: 'Right-click an element by ref',
	args: z.object({
		ref: z.string().describe('Element ref from aria snapshot (e.g., "e5")'),
	}),
	options: z.object({
		force: z
			.boolean()
			.optional()
			.describe('Force right-click, disabling actionability checks'),
	}),
});

export const type_ = declareCommand({
	name: 'type',
	category: 'interaction',
	description: 'Type text into an element',
	args: z.object({
		ref: z.string().describe('Element ref from aria snapshot'),
		text: z.string().describe('Text to type'),
	}),
	options: z.object({
		delay: z.number().optional().describe('Delay between keystrokes in ms'),
		force: z
			.boolean()
			.optional()
			.describe('Force type, disabling actionability checks'),
	}),
});

export const clear = declareCommand({
	name: 'clear',
	category: 'interaction',
	description: 'Clear an input element',
	args: z.object({
		ref: z.string().describe('Element ref from aria snapshot'),
	}),
	options: z.object({
		force: z
			.boolean()
			.optional()
			.describe('Force clear, disabling actionability checks'),
	}),
});

export const check = declareCommand({
	name: 'check',
	category: 'interaction',
	description: 'Check a checkbox or radio button',
	args: z.object({
		ref: z.string().describe('Element ref from aria snapshot'),
	}),
	options: z.object({
		force: z
			.boolean()
			.optional()
			.describe('Force check, disabling actionability checks'),
	}),
});

export const uncheck = declareCommand({
	name: 'uncheck',
	category: 'interaction',
	description: 'Uncheck a checkbox',
	args: z.object({
		ref: z.string().describe('Element ref from aria snapshot'),
	}),
	options: z.object({
		force: z
			.boolean()
			.optional()
			.describe('Force uncheck, disabling actionability checks'),
	}),
});

export const select = declareCommand({
	name: 'select',
	category: 'interaction',
	description: 'Select an option from a select element',
	args: z.object({
		ref: z.string().describe('Element ref from aria snapshot'),
		value: z.string().describe('Option value or visible text to select'),
	}),
	options: z.object({
		force: z
			.boolean()
			.optional()
			.describe('Force select, disabling actionability checks'),
	}),
});

export const focus = declareCommand({
	name: 'focus',
	category: 'interaction',
	description: 'Focus an element',
	args: z.object({
		ref: z.string().describe('Element ref from aria snapshot'),
	}),
	options: z.object({}),
});

export const blur = declareCommand({
	name: 'blur',
	category: 'interaction',
	description: 'Blur an element',
	args: z.object({
		ref: z.string().describe('Element ref from aria snapshot'),
	}),
	options: z.object({}),
});

export const scrollto = declareCommand({
	name: 'scrollto',
	category: 'interaction',
	description: 'Scroll to element or position',
	args: z.object({
		target: z
			.string()
			.describe('Element ref or scroll position (e.g., "top", "bottom")'),
	}),
	options: z.object({
		duration: z.number().optional().describe('Scroll animation duration in ms'),
	}),
});

export const hover = declareCommand({
	name: 'hover',
	category: 'interaction',
	description: 'Trigger hover on an element',
	args: z.object({
		ref: z.string().describe('Element ref from aria snapshot'),
	}),
	options: z.object({
		force: z
			.boolean()
			.optional()
			.describe('Force hover, disabling actionability checks'),
	}),
});

export const fill = declareCommand({
	name: 'fill',
	category: 'interaction',
	description: 'Clear and type text into an element (clear + type)',
	args: z.object({
		ref: z.string().describe('Element ref from aria snapshot'),
		text: z.string().describe('Text to fill'),
	}),
	options: z.object({
		force: z
			.boolean()
			.optional()
			.describe('Force fill, disabling actionability checks'),
	}),
});

// ---------------------------------------------------------------------------
// Keyboard commands
// ---------------------------------------------------------------------------

export const press = declareCommand({
	name: 'press',
	category: 'keyboard',
	description: 'Press a key',
	args: z.object({
		key: z.string().describe('Key to press (e.g., "Enter", "Escape", "Tab")'),
	}),
	options: z.object({}),
});

// ---------------------------------------------------------------------------
// Dialog commands
// ---------------------------------------------------------------------------

export const dialogAccept = declareCommand({
	name: 'dialog-accept',
	category: 'interaction',
	description: 'Accept the next browser dialog (alert, confirm, prompt)',
	args: z.object({
		text: z.string().optional().describe('Text to enter in a prompt dialog'),
	}),
	options: z.object({}),
});

export const dialogDismiss = declareCommand({
	name: 'dialog-dismiss',
	category: 'interaction',
	description: 'Dismiss the next browser dialog (confirm)',
	args: z.object({}),
	options: z.object({}),
});

// ---------------------------------------------------------------------------
// Viewport commands
// ---------------------------------------------------------------------------

export const resize = declareCommand({
	name: 'resize',
	category: 'interaction',
	description: 'Change the browser viewport dimensions',
	args: z.object({
		width: z.coerce.number().describe('Viewport width in pixels'),
		height: z.coerce.number().describe('Viewport height in pixels'),
	}),
	options: z.object({}),
});

// ---------------------------------------------------------------------------
// Assertion commands
// ---------------------------------------------------------------------------

export const assert_ = declareCommand({
	name: 'assert',
	category: 'assertion',
	description: 'Assert on an element',
	args: z.object({
		ref: z.string().describe('Element ref from aria snapshot'),
		chainer: z
			.string()
			.describe('Chai chainer (e.g., "be.visible", "have.text", "contain")'),
		value: z.string().optional().describe('Expected value'),
	}),
	options: z.object({}),
});

export const asserturl = declareCommand({
	name: 'asserturl',
	category: 'assertion',
	description: 'Assert on the current URL',
	args: z.object({
		chainer: z.string().describe('Chai chainer (e.g., "include", "eq")'),
		value: z.string().describe('Expected URL or substring'),
	}),
	options: z.object({}),
});

export const asserttitle = declareCommand({
	name: 'asserttitle',
	category: 'assertion',
	description: 'Assert on the page title',
	args: z.object({
		chainer: z.string().describe('Chai chainer (e.g., "eq", "include")'),
		value: z.string().describe('Expected title or substring'),
	}),
	options: z.object({}),
});

// ---------------------------------------------------------------------------
// Export commands
// ---------------------------------------------------------------------------

export const export_ = declareCommand({
	name: 'export',
	category: 'export',
	description: 'Export commands as a .cy.ts test file',
	args: z.object({}),
	options: z.object({
		file: z.string().optional().describe('Output file path'),
		format: z.enum(['js', 'ts']).optional().describe('Output file format'),
		describe: z.string().optional().describe('Custom describe block name'),
		it: z.string().optional().describe('Custom it block name'),
		baseUrl: z
			.string()
			.optional()
			.describe('Base URL for making cy.visit() paths relative'),
	}),
});

export const history = declareCommand({
	name: 'history',
	category: 'export',
	description: 'List all commands executed in this session',
	args: z.object({}),
	options: z.object({}),
});

export const undo = declareCommand({
	name: 'undo',
	category: 'export',
	description: 'Remove last command from export history',
	args: z.object({}),
	options: z.object({}),
});

// ---------------------------------------------------------------------------
// Execution commands
// ---------------------------------------------------------------------------

export const runCode = declareCommand({
	name: 'run-code',
	category: 'execution',
	description: 'Execute arbitrary JavaScript in the browser page context',
	args: z.object({
		code: z.string().describe('JavaScript code to execute'),
	}),
	options: z.object({}),
});

// ---------------------------------------------------------------------------
// Wait commands
// ---------------------------------------------------------------------------

export const wait = declareCommand({
	name: 'wait',
	category: 'wait',
	description: 'Wait for a specified duration',
	args: z.object({
		ms: z.coerce.number().describe('Duration in milliseconds'),
	}),
	options: z.object({}),
});

export const waitfor = declareCommand({
	name: 'waitfor',
	category: 'wait',
	description: 'Wait for an element to exist',
	args: z.object({
		ref: z.string().describe('Element ref to wait for'),
	}),
	options: z.object({
		timeout: z.number().optional().describe('Timeout in ms'),
	}),
});

// ---------------------------------------------------------------------------
// Network commands
// ---------------------------------------------------------------------------

export const network = declareCommand({
	name: 'network',
	category: 'network',
	description: 'List network requests captured since page load',
	args: z.object({}),
	options: z.object({}),
});

export const intercept = declareCommand({
	name: 'intercept',
	category: 'network',
	description: 'Mock network requests matching a URL pattern',
	args: z.object({
		pattern: z
			.string()
			.describe('URL pattern to intercept (e.g., "**/api/**")'),
	}),
	options: z.object({
		status: z.coerce.number().optional().describe('Mock response status code'),
		body: z.string().optional().describe('Mock response body (JSON string)'),
		'content-type': z
			.string()
			.optional()
			.describe('Mock response Content-Type header'),
	}),
});

export const interceptList = declareCommand({
	name: 'intercept-list',
	category: 'network',
	description: 'List active intercept route mocks',
	args: z.object({}),
	options: z.object({}),
});

export const unintercept = declareCommand({
	name: 'unintercept',
	category: 'network',
	description: 'Remove intercept route mock(s)',
	args: z.object({
		pattern: z
			.string()
			.optional()
			.describe('URL pattern to remove; omit to remove all'),
	}),
	options: z.object({}),
});

// ---------------------------------------------------------------------------
// Screenshot command
// ---------------------------------------------------------------------------

export const screenshot = declareCommand({
	name: 'screenshot',
	category: 'core',
	description: 'Capture a screenshot of the page or an element',
	args: z.object({
		ref: z.string().optional().describe('Element ref for element screenshot'),
	}),
	options: z.object({
		filename: z.string().optional().describe('Output filename'),
	}),
});

// ---------------------------------------------------------------------------
// Drag command
// ---------------------------------------------------------------------------

export const drag = declareCommand({
	name: 'drag',
	category: 'interaction',
	description: 'Drag an element to another element',
	args: z.object({
		startRef: z.string().describe('Element ref to drag from'),
		endRef: z.string().describe('Element ref to drop onto'),
	}),
	options: z.object({
		force: z
			.boolean()
			.optional()
			.describe('Force drag, disabling actionability checks'),
	}),
});

// ---------------------------------------------------------------------------
// Upload command
// ---------------------------------------------------------------------------

export const upload = declareCommand({
	name: 'upload',
	category: 'interaction',
	description: 'Upload a file to a file input element',
	args: z.object({
		ref: z.string().describe('Element ref of file input'),
		file: z.string().describe('Path to file to upload'),
	}),
	options: z.object({
		force: z
			.boolean()
			.optional()
			.describe('Force upload, disabling actionability checks'),
	}),
});

// ---------------------------------------------------------------------------
// Command registry
// ---------------------------------------------------------------------------

/**
 * All declared command schemas as an array (each entry includes its own `name`).
 */
export const allCommands = [
	open,
	stop,
	status,
	install,
	snapshot,
	navigate,
	back,
	forward,
	reload,
	click,
	dblclick,
	rightclick,
	type_,
	clear,
	check,
	uncheck,
	select,
	focus,
	blur,
	scrollto,
	hover,
	fill,
	press,
	assert_,
	asserturl,
	asserttitle,
	export_,
	history,
	undo,
	runCode,
	wait,
	waitfor,
	network,
	intercept,
	interceptList,
	unintercept,
	screenshot,
	drag,
	upload,
	dialogAccept,
	dialogDismiss,
	resize,
] as const;

/**
 * Builds the command registry map used by parseCommand.
 *
 * Maps command names to their schema + positional argument mapping.
 * The positional mapping tells parseCommand how to assign values from
 * minimist's `_` array to named args fields.
 */
export function buildRegistry(): ReadonlyMap<string, CommandRegistryEntry> {
	const registry = new Map<string, CommandRegistryEntry>();

	// Core
	registry.set('open', { schema: open, positionals: ['url'] });
	registry.set('stop', { schema: stop, positionals: [] });
	registry.set('status', { schema: status, positionals: [] });
	registry.set('install', { schema: install, positionals: [] });
	registry.set('snapshot', { schema: snapshot, positionals: [] });

	// Navigation
	registry.set('navigate', { schema: navigate, positionals: ['url'] });
	registry.set('back', { schema: back, positionals: [] });
	registry.set('forward', { schema: forward, positionals: [] });
	registry.set('reload', { schema: reload, positionals: [] });

	// Interaction
	registry.set('click', { schema: click, positionals: ['ref'] });
	registry.set('dblclick', { schema: dblclick, positionals: ['ref'] });
	registry.set('rightclick', { schema: rightclick, positionals: ['ref'] });
	registry.set('type', { schema: type_, positionals: ['ref', 'text'] });
	registry.set('clear', { schema: clear, positionals: ['ref'] });
	registry.set('check', { schema: check, positionals: ['ref'] });
	registry.set('uncheck', { schema: uncheck, positionals: ['ref'] });
	registry.set('select', { schema: select, positionals: ['ref', 'value'] });
	registry.set('focus', { schema: focus, positionals: ['ref'] });
	registry.set('blur', { schema: blur, positionals: ['ref'] });
	registry.set('scrollto', { schema: scrollto, positionals: ['target'] });
	registry.set('hover', { schema: hover, positionals: ['ref'] });
	registry.set('fill', { schema: fill, positionals: ['ref', 'text'] });

	// Dialog
	registry.set('dialog-accept', {
		schema: dialogAccept,
		positionals: ['text'],
	});
	registry.set('dialog-dismiss', {
		schema: dialogDismiss,
		positionals: [],
	});

	// Viewport
	registry.set('resize', {
		schema: resize,
		positionals: ['width', 'height'],
	});

	// Keyboard
	registry.set('press', { schema: press, positionals: ['key'] });

	// Assertion
	registry.set('assert', {
		schema: assert_,
		positionals: ['ref', 'chainer', 'value'],
	});
	registry.set('asserturl', {
		schema: asserturl,
		positionals: ['chainer', 'value'],
	});
	registry.set('asserttitle', {
		schema: asserttitle,
		positionals: ['chainer', 'value'],
	});

	// Export
	registry.set('export', { schema: export_, positionals: [] });
	registry.set('history', { schema: history, positionals: [] });
	registry.set('undo', { schema: undo, positionals: [] });

	// Execution
	registry.set('run-code', { schema: runCode, positionals: ['code'] });

	// Wait
	registry.set('wait', { schema: wait, positionals: ['ms'] });
	registry.set('waitfor', { schema: waitfor, positionals: ['ref'] });

	// Network
	registry.set('network', { schema: network, positionals: [] });
	registry.set('intercept', { schema: intercept, positionals: ['pattern'] });
	registry.set('intercept-list', {
		schema: interceptList,
		positionals: [],
	});
	registry.set('unintercept', {
		schema: unintercept,
		positionals: ['pattern'],
	});

	// Screenshot
	registry.set('screenshot', {
		schema: screenshot,
		positionals: ['ref'],
	});

	// Drag
	registry.set('drag', {
		schema: drag,
		positionals: ['startRef', 'endRef'],
	});

	// Upload
	registry.set('upload', {
		schema: upload,
		positionals: ['ref', 'file'],
	});

	// Aliases (playwright-cli naming compatibility)
	registry.set('close', { schema: stop, positionals: [] });
	registry.set('goto', { schema: navigate, positionals: ['url'] });
	registry.set('go-back', { schema: back, positionals: [] });
	registry.set('go-forward', { schema: forward, positionals: [] });

	return registry;
}

/**
 * The default command registry instance.
 */
export const commandRegistry = buildRegistry();
