/**
 * Pre-flight element validation for Cypress commands.
 *
 * Validates that a DOM element is appropriate for a given command action
 * before executing it. This prevents Cypress from throwing internal errors
 * that crash the entire session (e.g., calling `.type()` on a `<h1>`).
 *
 * Returns an error message string if the element is invalid for the command,
 * or `undefined` if the element is valid. This is a pure function with no
 * side effects, making it testable in isolation.
 */

/**
 * Input types that do not support `.type()`.
 * These are non-text input types where typing doesn't make sense.
 */
const NON_TYPEABLE_INPUT_TYPES = new Set([
	'submit',
	'reset',
	'image',
	'button',
	'hidden',
	'file',
	'range',
	'color',
]);

/**
 * Validates that a DOM element is appropriate for the given command action.
 *
 * Checks element tag names and attributes to prevent Cypress commands from
 * being called on incompatible elements (e.g., `type` on a heading, `check`
 * on a div). Returns a descriptive error message if invalid, or `undefined`
 * if the element is valid for the command.
 *
 * @param element - The DOM element to validate
 * @param action - The command action (e.g. 'type', 'check', 'select', 'clear')
 * @returns An error message if the element is invalid, or undefined if valid
 */
export function validateElementForCommand(
	element: Element,
	action: string,
): string | undefined {
	const tag = element.tagName;

	switch (action) {
		case 'type':
		case 'fill': {
			const isContentEditable =
				element.hasAttribute('contenteditable') &&
				element.getAttribute('contenteditable') !== 'false';
			if (tag === 'INPUT') {
				const inputType = (element as HTMLInputElement).type.toLowerCase();
				if (NON_TYPEABLE_INPUT_TYPES.has(inputType)) {
					return (
						`Cannot type into <input type="${inputType}"> — ` +
						'only text-like inputs, textareas, and contenteditable elements support typing.'
					);
				}
			} else if (tag !== 'TEXTAREA' && !isContentEditable) {
				return (
					`Cannot type into <${tag.toLowerCase()}> — cy.type() can only be called on ` +
					'textarea, text-like inputs, or elements with contenteditable="true".'
				);
			}
			break;
		}

		case 'clear': {
			const isContentEditable =
				element.hasAttribute('contenteditable') &&
				element.getAttribute('contenteditable') !== 'false';
			if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !isContentEditable) {
				return (
					`Cannot clear <${tag.toLowerCase()}> — cy.clear() can only be called on ` +
					'inputs, textareas, or contenteditable elements.'
				);
			}
			break;
		}

		case 'check':
		case 'uncheck': {
			if (tag !== 'INPUT') {
				return (
					`Cannot ${action} <${tag.toLowerCase()}> — cy.${action}() can only be called on ` +
					'checkboxes and radio buttons.'
				);
			}
			const inputType = (element as HTMLInputElement).type.toLowerCase();
			if (inputType !== 'checkbox' && inputType !== 'radio') {
				return (
					`Cannot ${action} <input type="${inputType}"> — cy.${action}() can only be called on ` +
					'checkboxes and radio buttons.'
				);
			}
			break;
		}

		case 'select': {
			if (tag !== 'SELECT') {
				return (
					`Cannot select on <${tag.toLowerCase()}> — cy.select() can only be called on ` +
					'<select> elements.'
				);
			}
			break;
		}

		case 'upload': {
			if (tag !== 'INPUT') {
				return (
					`Cannot upload to <${tag.toLowerCase()}> — cy.selectFile() can only be called on ` +
					'<input> elements.'
				);
			}
			const inputType = (element as HTMLInputElement).type.toLowerCase();
			if (inputType !== 'file') {
				return (
					`Cannot upload to <input type="${inputType}"> — cy.selectFile() can only be called on ` +
					'<input type="file"> elements.'
				);
			}
			break;
		}
	}

	return undefined;
}
