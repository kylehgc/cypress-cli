/**
 * Test file template engine for codegen.
 *
 * Generates the describe/it wrapper structure for exported Cypress test files.
 * Supports both JavaScript and TypeScript output formats.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Options controlling the structure of the generated test file.
 */
export interface TemplateOptions {
	/** Name for the describe block (default: 'cypress-cli generated test') */
	describeName?: string;
	/** Name for the it block (default: 'should complete the recorded flow') */
	itName?: string;
	/** Output format: 'js' or 'ts' (default: 'js') */
	format?: 'js' | 'ts';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DESCRIBE_NAME = 'cypress-cli generated test';
const DEFAULT_IT_NAME = 'should complete the recorded flow';
const INDENT = '\t';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Wraps an array of Cypress command strings in a describe/it test structure.
 *
 * @param commands - Array of Cypress command strings (e.g. "cy.visit('/login')")
 * @param options - Template customization options
 * @returns A complete Cypress test file as a string
 */
export function renderTestFile(
	commands: string[],
	options: TemplateOptions = {},
): string {
	const describeName = options.describeName ?? DEFAULT_DESCRIBE_NAME;
	const itName = options.itName ?? DEFAULT_IT_NAME;

	const body = commands
		.map((cmd) => `${INDENT}${INDENT}${cmd};`)
		.join('\n');

	const lines: string[] = [];

	lines.push(`describe('${_escapeQuotes(describeName)}', () => {`);
	lines.push(`${INDENT}it('${_escapeQuotes(itName)}', () => {`);
	if (body.length > 0) {
		lines.push(body);
	}
	lines.push(`${INDENT}});`);
	lines.push(`});`);
	lines.push('');

	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escape single quotes in template string values.
 */
function _escapeQuotes(str: string): string {
	return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
