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
// Command registry
// ---------------------------------------------------------------------------

/**
 * All declared command schemas as an array (each entry includes its own `name`).
 */
export const allCommands = [
	open,
	stop,
	status,
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
	press,
	assert_,
	asserturl,
	asserttitle,
	export_,
	history,
	undo,
	wait,
	waitfor,
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

	// Wait
	registry.set('wait', { schema: wait, positionals: ['ms'] });
	registry.set('waitfor', { schema: waitfor, positionals: ['ref'] });

	return registry;
}

/**
 * The default command registry instance.
 */
export const commandRegistry = buildRegistry();
