import { describe, it, expect } from 'vitest';
import { normalizeWhiteSpace } from '../../../src/injected/stringUtils.js';

describe('normalizeWhiteSpace', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeWhiteSpace('  hello  ')).toBe('hello');
  });

  it('collapses multiple spaces into one', () => {
    expect(normalizeWhiteSpace('hello   world')).toBe('hello world');
  });

  it('normalizes tabs and newlines', () => {
    expect(normalizeWhiteSpace('hello\n\tworld')).toBe('hello world');
  });

  it('removes zero-width spaces', () => {
    expect(normalizeWhiteSpace('hello\u200bworld')).toBe('helloworld');
  });

  it('removes soft hyphens', () => {
    expect(normalizeWhiteSpace('hello\u00adworld')).toBe('helloworld');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalizeWhiteSpace('   ')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeWhiteSpace('')).toBe('');
  });

  it('handles mixed whitespace characters', () => {
    expect(normalizeWhiteSpace('  a \t b \n c  ')).toBe('a b c');
  });

  it('preserves single words unchanged', () => {
    expect(normalizeWhiteSpace('hello')).toBe('hello');
  });

  it('handles zero-width space with surrounding whitespace', () => {
    expect(normalizeWhiteSpace('  \u200b  ')).toBe('');
  });
});
