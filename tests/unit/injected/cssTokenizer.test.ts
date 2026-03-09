import { describe, expect, it } from 'vitest';

import {
	IdentToken,
	InvalidCharacterError,
	HashToken,
	WhitespaceToken,
tokenize,
} from '../../../src/injected/cssTokenizer.js';

describe('cssTokenizer', () => {
	it('tokenize() parses standard selectors', () => {
		const tokens = tokenize('div#main .button');
		const idents = tokens.filter((token) => token instanceof IdentToken);
		const hashes = tokens.filter((token) => token instanceof HashToken);

		expect(idents.map((token) => token.value)).toEqual(['div', 'button']);
		expect(hashes.map((token) => token.value)).toEqual(['main']);
		expect(tokens.length).toBeGreaterThan(0);
	});

it('tokenize() handles escapes, unicode, and whitespace edge cases', () => {
const tokens = tokenize(' .a\\:b\n#π ');
const source = tokens.map((token) => token.toSource()).join('');
		const idents = tokens.filter((token) => token instanceof IdentToken);
		const hasWhitespace = tokens.some((token) => token instanceof WhitespaceToken);

		expect(hasWhitespace).toBe(true);
		expect(idents.map((token) => token.value)).toEqual(['a:b']);
		expect(source).toContain('#π');
	});

	it('throws InvalidCharacterError for null characters and exposes error metadata', () => {
		expect(() => new IdentToken('\u0000').toSource()).toThrow(InvalidCharacterError);
		expect(() => new IdentToken('\u0000').toSource()).toThrow(
			'Invalid character: the input contains U+0000.',
		);

const err = new InvalidCharacterError('bad input');
expect(err.name).toBe('InvalidCharacterError');
expect(err.message).toBe('bad input');
});
});
