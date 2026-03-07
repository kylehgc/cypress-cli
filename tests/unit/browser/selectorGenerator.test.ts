import { describe, it, expect } from 'vitest';

import {
	DEFAULT_SELECTOR_PRIORITY,
	generateSelector,
	buildFallbackSelector,
	buildCypressCommand,
} from '../../../src/browser/selectorGenerator.js';

describe('selectorGenerator', () => {
	describe('DEFAULT_SELECTOR_PRIORITY', () => {
		it('has 10 entries matching Cypress defaults', () => {
			expect(DEFAULT_SELECTOR_PRIORITY).toHaveLength(10);
		});

		it('starts with data-cy as highest priority', () => {
			expect(DEFAULT_SELECTOR_PRIORITY[0]).toBe('data-cy');
		});

		it('ends with nth-child as lowest priority', () => {
			expect(DEFAULT_SELECTOR_PRIORITY[9]).toBe('nth-child');
		});

		it('matches the full Cypress default order', () => {
			expect(DEFAULT_SELECTOR_PRIORITY).toEqual([
				'data-cy',
				'data-test',
				'data-testid',
				'data-qa',
				'name',
				'id',
				'class',
				'tag',
				'attributes',
				'nth-child',
			]);
		});
	});

	describe('generateSelector', () => {
		it('generates a selector for an element with an id', () => {
			const el = document.createElement('button');
			el.id = 'submit-btn';
			document.body.appendChild(el);

			const selector = generateSelector(el);
			expect(selector).toContain('submit-btn');

			el.remove();
		});

		it('generates a selector for an element with data-cy', () => {
			const el = document.createElement('div');
			el.setAttribute('data-cy', 'login-form');
			document.body.appendChild(el);

			const selector = generateSelector(el);
			expect(selector).toContain('login-form');

			el.remove();
		});

		it('generates a selector for an element with a class', () => {
			const el = document.createElement('span');
			el.className = 'unique-test-class-xyz';
			document.body.appendChild(el);

			const selector = generateSelector(el);
			expect(selector).toContain('unique-test-class-xyz');

			el.remove();
		});

		it('returns a string that can be used to query the element', () => {
			const el = document.createElement('input');
			el.setAttribute('data-testid', 'email-input');
			document.body.appendChild(el);

			const selector = generateSelector(el);
			const found = document.querySelector(selector);
			expect(found).toBe(el);

			el.remove();
		});
	});

	describe('buildFallbackSelector', () => {
		it('prefers stable data attributes', () => {
			const el = document.createElement('button');
			el.setAttribute('data-cy', 'submit-order');
			document.body.appendChild(el);

			expect(buildFallbackSelector(el)).toBe('[data-cy="submit-order"]');

			el.remove();
		});

		it('falls back to id selectors', () => {
			const el = document.createElement('button');
			el.id = 'submit-btn';
			document.body.appendChild(el);

			expect(buildFallbackSelector(el)).toBe('#submit-btn');

			el.remove();
		});

		it('builds a structural selector when needed', () => {
			const wrapper = document.createElement('main');
			const first = document.createElement('button');
			first.textContent = 'One';
			const second = document.createElement('button');
			second.textContent = 'Two';
			wrapper.append(first, second);
			document.body.appendChild(wrapper);

			const selector = buildFallbackSelector(second);
			expect(document.querySelector(selector)).toBe(second);

			wrapper.remove();
		});
	});

	describe('buildCypressCommand', () => {
		it('builds click command', () => {
			const result = buildCypressCommand('#btn', 'click');
			expect(result).toBe("cy.get('#btn').click()");
		});

		it('builds dblclick command', () => {
			const result = buildCypressCommand('#btn', 'dblclick');
			expect(result).toBe("cy.get('#btn').dblclick()");
		});

		it('builds rightclick command', () => {
			const result = buildCypressCommand('#btn', 'rightclick');
			expect(result).toBe("cy.get('#btn').rightclick()");
		});

		it('builds type command with text', () => {
			const result = buildCypressCommand('#input', 'type', 'hello');
			expect(result).toBe("cy.get('#input').type('hello')");
		});

		it('builds type command escaping single quotes in text', () => {
			const result = buildCypressCommand('#input', 'type', "it's");
			expect(result).toBe("cy.get('#input').type('it\\'s')");
		});

		it('builds select command', () => {
			const result = buildCypressCommand('#dropdown', 'select', 'admin');
			expect(result).toBe("cy.get('#dropdown').select('admin')");
		});

		it('builds clear command', () => {
			const result = buildCypressCommand('#input', 'clear');
			expect(result).toBe("cy.get('#input').clear()");
		});

		it('builds check command', () => {
			const result = buildCypressCommand('#checkbox', 'check');
			expect(result).toBe("cy.get('#checkbox').check()");
		});

		it('builds uncheck command', () => {
			const result = buildCypressCommand('#checkbox', 'uncheck');
			expect(result).toBe("cy.get('#checkbox').uncheck()");
		});

		it('builds focus command', () => {
			const result = buildCypressCommand('#input', 'focus');
			expect(result).toBe("cy.get('#input').focus()");
		});

		it('builds blur command', () => {
			const result = buildCypressCommand('#input', 'blur');
			expect(result).toBe("cy.get('#input').blur()");
		});

		it('builds hover command as trigger mouseover', () => {
			const result = buildCypressCommand('#btn', 'hover');
			expect(result).toBe("cy.get('#btn').trigger('mouseover')");
		});

		it('builds scrollto command as scrollIntoView', () => {
			const result = buildCypressCommand('#section', 'scrollto');
			expect(result).toBe("cy.get('#section').scrollIntoView()");
		});

		it('builds assert command with chainer and value', () => {
			const result = buildCypressCommand('#el', 'assert', 'Hello', 'have.text');
			expect(result).toBe("cy.get('#el').should('have.text', 'Hello')");
		});

		it('builds assert command with chainer only', () => {
			const result = buildCypressCommand('#el', 'assert', undefined, 'be.visible');
			expect(result).toBe("cy.get('#el').should('be.visible')");
		});

		it('builds assert command with placeholder when no chainer provided', () => {
			const result = buildCypressCommand('#el', 'assert');
			expect(result).toBe("cy.get('#el').should(...)");
		});

		it('builds waitfor command', () => {
			const result = buildCypressCommand('#el', 'waitfor');
			expect(result).toBe("cy.get('#el').should('exist')");
		});

		it('escapes single quotes in selector', () => {
			const result = buildCypressCommand("[data-cy='login']", 'click');
			expect(result).toBe("cy.get('[data-cy=\\'login\\']').click()");
		});

		it('escapes backslashes in selector', () => {
			const result = buildCypressCommand('a\\b', 'click');
			expect(result).toBe("cy.get('a\\\\b').click()");
		});

		it('escapes backslashes in type text', () => {
			const result = buildCypressCommand('#input', 'type', 'path\\to\\file');
			expect(result).toBe("cy.get('#input').type('path\\\\to\\\\file')");
		});

		it('escapes backslashes in select text', () => {
			const result = buildCypressCommand('#dropdown', 'select', 'a\\b');
			expect(result).toBe("cy.get('#dropdown').select('a\\\\b')");
		});

		it('handles unknown actions with fallback', () => {
			const result = buildCypressCommand('#el', 'customAction');
			expect(result).toBe("cy.get('#el').customAction()");
		});
	});

	describe('buildCypressCommand (non-ref commands)', () => {
		it('builds navigate command', () => {
			const result = buildCypressCommand(undefined, 'navigate', 'https://example.com');
			expect(result).toBe("cy.visit('https://example.com')");
		});

		it('builds navigate command escaping quotes in URL', () => {
			const result = buildCypressCommand(undefined, 'navigate', "https://example.com/path?q='test'");
			expect(result).toBe("cy.visit('https://example.com/path?q=\\'test\\'')");
		});

		it('builds back command', () => {
			const result = buildCypressCommand(undefined, 'back');
			expect(result).toBe("cy.go('back')");
		});

		it('builds forward command', () => {
			const result = buildCypressCommand(undefined, 'forward');
			expect(result).toBe("cy.go('forward')");
		});

		it('builds reload command', () => {
			const result = buildCypressCommand(undefined, 'reload');
			expect(result).toBe('cy.reload()');
		});

		it('builds press command', () => {
			const result = buildCypressCommand(undefined, 'press', 'Enter');
			expect(result).toBe("cy.get('body').type('{Enter}')");
		});

		it('builds asserturl command with chainer and value', () => {
			const result = buildCypressCommand(undefined, 'asserturl', '/dashboard', 'include');
			expect(result).toBe("cy.url().should('include', '/dashboard')");
		});

		it('builds asserturl command with chainer only', () => {
			const result = buildCypressCommand(undefined, 'asserturl', undefined, 'not.be.empty');
			expect(result).toBe("cy.url().should('not.be.empty')");
		});

		it('builds asserturl command with placeholder when no chainer', () => {
			const result = buildCypressCommand(undefined, 'asserturl');
			expect(result).toBe('cy.url().should(...)');
		});

		it('builds asserttitle command with chainer and value', () => {
			const result = buildCypressCommand(undefined, 'asserttitle', 'Dashboard', 'eq');
			expect(result).toBe("cy.title().should('eq', 'Dashboard')");
		});

		it('builds asserttitle command with chainer only', () => {
			const result = buildCypressCommand(undefined, 'asserttitle', undefined, 'not.be.empty');
			expect(result).toBe("cy.title().should('not.be.empty')");
		});

		it('builds asserttitle command with placeholder when no chainer', () => {
			const result = buildCypressCommand(undefined, 'asserttitle');
			expect(result).toBe('cy.title().should(...)');
		});

		it('builds wait command with milliseconds', () => {
			const result = buildCypressCommand(undefined, 'wait', '2000');
			expect(result).toBe('cy.wait(2000)');
		});

		it('builds wait command defaulting to 0 for non-numeric text', () => {
			const result = buildCypressCommand(undefined, 'wait');
			expect(result).toBe('cy.wait(0)');
		});

		it('builds scrollto command with position', () => {
			const result = buildCypressCommand(undefined, 'scrollto', 'bottom');
			expect(result).toBe("cy.scrollTo('bottom')");
		});

		it('builds snapshot command as comment', () => {
			const result = buildCypressCommand(undefined, 'snapshot');
			expect(result).toBe('// snapshot (read-only)');
		});

		it('handles unknown non-ref actions with fallback', () => {
			const result = buildCypressCommand(undefined, 'unknownAction');
			expect(result).toBe('cy.unknownAction()');
		});
	});
});
