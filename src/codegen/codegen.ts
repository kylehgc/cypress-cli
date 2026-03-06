/**
 * Codegen: converts recorded command history into a valid Cypress test file.
 *
 * Consumes the `cypressCommand` field from command results (pre-computed by
 * the browser module's selectorGenerator) and assembles them into a test file
 * using the template engine.
 */

import type { QueuedCommand, CommandResult } from '../daemon/commandQueue.js';
import { renderTestFile, type TemplateOptions } from './templateEngine.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single entry in the codegen command history.
 */
export interface HistoryEntry {
	/** Position index in the history */
	index: number;
	/** The raw command from the CLI */
	command: QueuedCommand;
	/** Resolved CSS selector (undefined for navigate, wait, etc.) */
	selector?: string;
	/** The Cypress code string */
	cypressCode: string;
	/** YAML snapshot after command */
	afterSnapshot?: string;
}

/**
 * Options for generating the test file.
 */
export interface GenerateOptions extends TemplateOptions {
	/** Base URL — if provided, cy.visit() paths will be made relative */
	baseUrl?: string;
}

// ---------------------------------------------------------------------------
// Actions to skip in codegen output
// ---------------------------------------------------------------------------

/**
 * Actions that are read-only or meta-commands and should not appear
 * in the exported test file.
 */
const SKIP_ACTIONS = new Set([
	'snapshot',
	'history',
	'undo',
	'export',
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build codegen history entries from session command history.
 *
 * Filters out commands that should not appear in the exported test
 * (e.g. snapshot, history, undo, export) and extracts the cypressCommand
 * string from results.
 *
 * @param sessionHistory - The raw command history from the session
 * @returns Array of HistoryEntry objects for codegen
 */
export function buildHistory(
	sessionHistory: ReadonlyArray<{
		command: QueuedCommand;
		result: CommandResult;
	}>,
): HistoryEntry[] {
	const entries: HistoryEntry[] = [];
	let index = 0;

	for (const { command, result } of sessionHistory) {
		// Skip commands that shouldn't appear in the test
		if (SKIP_ACTIONS.has(command.action)) {
			continue;
		}

		// Skip failed commands
		if (!result.success) {
			continue;
		}

		// cypressCommand is required for codegen — skip if missing
		if (!result.cypressCommand) {
			continue;
		}

		entries.push({
			index,
			command,
			selector: result.selector,
			cypressCode: result.cypressCommand,
			afterSnapshot: result.snapshot,
		});

		index++;
	}

	return entries;
}

/**
 * Generate a Cypress test file from command history.
 *
 * @param sessionHistory - The raw command history from the session
 * @param options - Generation options (describe name, it name, format, baseUrl)
 * @returns A valid Cypress test file as a string
 */
export function generateTestFile(
	sessionHistory: ReadonlyArray<{
		command: QueuedCommand;
		result: CommandResult;
	}>,
	options: GenerateOptions = {},
): string {
	const entries = buildHistory(sessionHistory);
	const commands = entries.map((entry) => {
		let code = entry.cypressCode;

		// If baseUrl is provided, make cy.visit() paths relative
		if (options.baseUrl && code.startsWith('cy.visit(')) {
			code = _makeVisitRelative(code, options.baseUrl);
		}

		return code;
	});

	return renderTestFile(commands, options);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Attempt to make a cy.visit() URL relative to a baseUrl.
 * e.g. cy.visit('https://example.com/login') with baseUrl 'https://example.com'
 *      becomes cy.visit('/login')
 */
function _makeVisitRelative(visitCode: string, baseUrl: string): string {
	// Extract the URL from cy.visit('...')
	const match = visitCode.match(/^cy\.visit\('(.*)'\)$/);
	if (!match) return visitCode;

	const url = match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
	const normalizedBase = baseUrl.replace(/\/+$/, '');

	if (url === normalizedBase || url.startsWith(normalizedBase + '/')) {
		let relativePath = url.slice(normalizedBase.length);
		if (!relativePath.startsWith('/')) {
			relativePath = '/' + relativePath;
		}
		const escapedPath = relativePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
		return `cy.visit('${escapedPath}')`;
	}

	return visitCode;
}
