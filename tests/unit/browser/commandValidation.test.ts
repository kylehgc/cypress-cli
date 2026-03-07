import { describe, it, expect } from 'vitest';

import { validateElementForCommand } from '../../../src/browser/commandValidation.js';

describe('validateElementForCommand', () => {
	// -----------------------------------------------------------------------
	// type command
	// -----------------------------------------------------------------------
	describe('type', () => {
		it('allows type on <input type="text">', () => {
			const el = document.createElement('input');
			el.type = 'text';
			expect(validateElementForCommand(el, 'type')).toBeUndefined();
		});

		it('allows type on <input type="email">', () => {
			const el = document.createElement('input');
			el.type = 'email';
			expect(validateElementForCommand(el, 'type')).toBeUndefined();
		});

		it('allows type on <input type="password">', () => {
			const el = document.createElement('input');
			el.type = 'password';
			expect(validateElementForCommand(el, 'type')).toBeUndefined();
		});

		it('allows type on <input type="search">', () => {
			const el = document.createElement('input');
			el.type = 'search';
			expect(validateElementForCommand(el, 'type')).toBeUndefined();
		});

		it('allows type on <input type="number">', () => {
			const el = document.createElement('input');
			el.type = 'number';
			expect(validateElementForCommand(el, 'type')).toBeUndefined();
		});

		it('allows type on <input type="tel">', () => {
			const el = document.createElement('input');
			el.type = 'tel';
			expect(validateElementForCommand(el, 'type')).toBeUndefined();
		});

		it('allows type on <input type="url">', () => {
			const el = document.createElement('input');
			el.type = 'url';
			expect(validateElementForCommand(el, 'type')).toBeUndefined();
		});

		it('allows type on <textarea>', () => {
			const el = document.createElement('textarea');
			expect(validateElementForCommand(el, 'type')).toBeUndefined();
		});

		it('allows type on contenteditable element', () => {
			const el = document.createElement('div');
			el.setAttribute('contenteditable', 'true');
			expect(validateElementForCommand(el, 'type')).toBeUndefined();
		});

		it('allows type on contenteditable="" (empty string is truthy)', () => {
			const el = document.createElement('div');
			el.setAttribute('contenteditable', '');
			expect(validateElementForCommand(el, 'type')).toBeUndefined();
		});

		it('rejects type on <h1>', () => {
			const el = document.createElement('h1');
			const error = validateElementForCommand(el, 'type');
			expect(error).toContain('Cannot type into <h1>');
			expect(error).toContain('cy.type()');
		});

		it('rejects type on <div> without contenteditable', () => {
			const el = document.createElement('div');
			const error = validateElementForCommand(el, 'type');
			expect(error).toContain('Cannot type into <div>');
		});

		it('rejects type on <span>', () => {
			const el = document.createElement('span');
			const error = validateElementForCommand(el, 'type');
			expect(error).toContain('Cannot type into <span>');
		});

		it('rejects type on <button>', () => {
			const el = document.createElement('button');
			const error = validateElementForCommand(el, 'type');
			expect(error).toContain('Cannot type into <button>');
		});

		it('rejects type on contenteditable="false"', () => {
			const el = document.createElement('div');
			el.setAttribute('contenteditable', 'false');
			const error = validateElementForCommand(el, 'type');
			expect(error).toContain('Cannot type into <div>');
		});

		it('rejects type on <input type="submit">', () => {
			const el = document.createElement('input');
			el.type = 'submit';
			const error = validateElementForCommand(el, 'type');
			expect(error).toContain('Cannot type into <input type="submit">');
		});

		it('rejects type on <input type="button">', () => {
			const el = document.createElement('input');
			el.type = 'button';
			const error = validateElementForCommand(el, 'type');
			expect(error).toContain('Cannot type into <input type="button">');
		});

		it('rejects type on <input type="hidden">', () => {
			const el = document.createElement('input');
			el.type = 'hidden';
			const error = validateElementForCommand(el, 'type');
			expect(error).toContain('Cannot type into <input type="hidden">');
		});

		it('rejects type on <input type="reset">', () => {
			const el = document.createElement('input');
			el.type = 'reset';
			const error = validateElementForCommand(el, 'type');
			expect(error).toContain('Cannot type into <input type="reset">');
		});

		it('rejects type on <input type="image">', () => {
			const el = document.createElement('input');
			el.type = 'image';
			const error = validateElementForCommand(el, 'type');
			expect(error).toContain('Cannot type into <input type="image">');
		});

		it('rejects type on <input type="file">', () => {
			const el = document.createElement('input');
			el.type = 'file';
			const error = validateElementForCommand(el, 'type');
			expect(error).toContain('Cannot type into <input type="file">');
		});

		it('rejects type on <input type="range">', () => {
			const el = document.createElement('input');
			el.type = 'range';
			const error = validateElementForCommand(el, 'type');
			expect(error).toContain('Cannot type into <input type="range">');
		});

		it('rejects type on <input type="color">', () => {
			const el = document.createElement('input');
			el.type = 'color';
			const error = validateElementForCommand(el, 'type');
			expect(error).toContain('Cannot type into <input type="color">');
		});
	});

	// -----------------------------------------------------------------------
	// clear command
	// -----------------------------------------------------------------------
	describe('clear', () => {
		it('allows clear on <input>', () => {
			const el = document.createElement('input');
			expect(validateElementForCommand(el, 'clear')).toBeUndefined();
		});

		it('allows clear on <textarea>', () => {
			const el = document.createElement('textarea');
			expect(validateElementForCommand(el, 'clear')).toBeUndefined();
		});

		it('allows clear on contenteditable element', () => {
			const el = document.createElement('div');
			el.setAttribute('contenteditable', 'true');
			expect(validateElementForCommand(el, 'clear')).toBeUndefined();
		});

		it('rejects clear on <h1>', () => {
			const el = document.createElement('h1');
			const error = validateElementForCommand(el, 'clear');
			expect(error).toContain('Cannot clear <h1>');
			expect(error).toContain('cy.clear()');
		});

		it('rejects clear on <div>', () => {
			const el = document.createElement('div');
			const error = validateElementForCommand(el, 'clear');
			expect(error).toContain('Cannot clear <div>');
		});

		it('rejects clear on <button>', () => {
			const el = document.createElement('button');
			const error = validateElementForCommand(el, 'clear');
			expect(error).toContain('Cannot clear <button>');
		});
	});

	// -----------------------------------------------------------------------
	// check / uncheck commands
	// -----------------------------------------------------------------------
	describe('check', () => {
		it('allows check on <input type="checkbox">', () => {
			const el = document.createElement('input');
			el.type = 'checkbox';
			expect(validateElementForCommand(el, 'check')).toBeUndefined();
		});

		it('allows check on <input type="radio">', () => {
			const el = document.createElement('input');
			el.type = 'radio';
			expect(validateElementForCommand(el, 'check')).toBeUndefined();
		});

		it('rejects check on <input type="text">', () => {
			const el = document.createElement('input');
			el.type = 'text';
			const error = validateElementForCommand(el, 'check');
			expect(error).toContain('Cannot check <input type="text">');
			expect(error).toContain('cy.check()');
		});

		it('rejects check on <div>', () => {
			const el = document.createElement('div');
			const error = validateElementForCommand(el, 'check');
			expect(error).toContain('Cannot check <div>');
		});

		it('rejects check on <label>', () => {
			const el = document.createElement('label');
			const error = validateElementForCommand(el, 'check');
			expect(error).toContain('Cannot check <label>');
		});
	});

	describe('uncheck', () => {
		it('allows uncheck on <input type="checkbox">', () => {
			const el = document.createElement('input');
			el.type = 'checkbox';
			expect(validateElementForCommand(el, 'uncheck')).toBeUndefined();
		});

		it('allows uncheck on <input type="radio">', () => {
			const el = document.createElement('input');
			el.type = 'radio';
			expect(validateElementForCommand(el, 'uncheck')).toBeUndefined();
		});

		it('rejects uncheck on <button>', () => {
			const el = document.createElement('button');
			const error = validateElementForCommand(el, 'uncheck');
			expect(error).toContain('Cannot uncheck <button>');
			expect(error).toContain('cy.uncheck()');
		});

		it('rejects uncheck on <input type="email">', () => {
			const el = document.createElement('input');
			el.type = 'email';
			const error = validateElementForCommand(el, 'uncheck');
			expect(error).toContain('Cannot uncheck <input type="email">');
		});
	});

	// -----------------------------------------------------------------------
	// select command
	// -----------------------------------------------------------------------
	describe('select', () => {
		it('allows select on <select>', () => {
			const el = document.createElement('select');
			expect(validateElementForCommand(el, 'select')).toBeUndefined();
		});

		it('rejects select on <div>', () => {
			const el = document.createElement('div');
			const error = validateElementForCommand(el, 'select');
			expect(error).toContain('Cannot select on <div>');
			expect(error).toContain('cy.select()');
		});

		it('rejects select on <input>', () => {
			const el = document.createElement('input');
			const error = validateElementForCommand(el, 'select');
			expect(error).toContain('Cannot select on <input>');
		});

		it('rejects select on <ul>', () => {
			const el = document.createElement('ul');
			const error = validateElementForCommand(el, 'select');
			expect(error).toContain('Cannot select on <ul>');
		});
	});

	// -----------------------------------------------------------------------
	// Commands that do not need element type validation
	// -----------------------------------------------------------------------
	describe('passthrough commands', () => {
		it('allows click on any element', () => {
			const el = document.createElement('div');
			expect(validateElementForCommand(el, 'click')).toBeUndefined();
		});

		it('allows focus on any element', () => {
			const el = document.createElement('span');
			expect(validateElementForCommand(el, 'focus')).toBeUndefined();
		});

		it('allows blur on any element', () => {
			const el = document.createElement('p');
			expect(validateElementForCommand(el, 'blur')).toBeUndefined();
		});

		it('allows hover on any element', () => {
			const el = document.createElement('a');
			expect(validateElementForCommand(el, 'hover')).toBeUndefined();
		});

		it('allows assert on any element', () => {
			const el = document.createElement('div');
			expect(validateElementForCommand(el, 'assert')).toBeUndefined();
		});

		it('allows unknown commands (no pre-flight validation)', () => {
			const el = document.createElement('div');
			expect(
				validateElementForCommand(el, 'someunknown'),
			).toBeUndefined();
		});
	});
});
