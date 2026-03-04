import { describe, it, expect } from 'vitest';
import { yamlEscapeKeyIfNeeded, yamlEscapeValueIfNeeded } from '../../../src/injected/yaml.js';

describe('yamlEscapeKeyIfNeeded', () => {
  it('returns simple strings unmodified', () => {
    expect(yamlEscapeKeyIfNeeded('hello')).toBe('hello');
  });

  it('quotes strings starting with dash', () => {
    const result = yamlEscapeKeyIfNeeded('-test');
    expect(result).toBe("'-test'");
  });

  it('quotes empty strings', () => {
    expect(yamlEscapeKeyIfNeeded('')).toBe("''");
  });

  it('quotes strings that look like numbers', () => {
    const result = yamlEscapeKeyIfNeeded('123');
    expect(result).toContain("'");
  });

  it('quotes YAML boolean keywords', () => {
    expect(yamlEscapeKeyIfNeeded('true')).toContain("'");
    expect(yamlEscapeKeyIfNeeded('false')).toContain("'");
    expect(yamlEscapeKeyIfNeeded('null')).toContain("'");
  });

  it('quotes strings with leading whitespace', () => {
    expect(yamlEscapeKeyIfNeeded(' hello')).toContain("'");
  });

  it('quotes strings with trailing whitespace', () => {
    expect(yamlEscapeKeyIfNeeded('hello ')).toContain("'");
  });

  it('quotes strings containing colon-space', () => {
    expect(yamlEscapeKeyIfNeeded('key: value')).toContain("'");
  });

  it('escapes single quotes inside quoted keys', () => {
    const result = yamlEscapeKeyIfNeeded("-it's");
    expect(result).toBe("'-it''s'");
  });

  it('quotes yes/no/on/off YAML keywords', () => {
    expect(yamlEscapeKeyIfNeeded('yes')).toContain("'");
    expect(yamlEscapeKeyIfNeeded('no')).toContain("'");
    expect(yamlEscapeKeyIfNeeded('on')).toContain("'");
    expect(yamlEscapeKeyIfNeeded('off')).toContain("'");
  });

  it('returns role-like strings unmodified', () => {
    expect(yamlEscapeKeyIfNeeded('button')).toBe('button');
    expect(yamlEscapeKeyIfNeeded('heading')).toBe('heading');
    expect(yamlEscapeKeyIfNeeded('link')).toBe('link');
  });
});

describe('yamlEscapeValueIfNeeded', () => {
  it('returns simple strings unmodified', () => {
    expect(yamlEscapeValueIfNeeded('hello world')).toBe('hello world');
  });

  it('quotes strings with newlines', () => {
    const result = yamlEscapeValueIfNeeded('line1\nline2');
    expect(result).toContain('"');
    expect(result).toContain('\\n');
  });

  it('leaves plain backslashes unquoted (no special meaning in YAML)', () => {
    const result = yamlEscapeValueIfNeeded('path\\to\\file');
    expect(result).toBe('path\\to\\file');
  });

  it('escapes backslashes when string is quoted for another reason', () => {
    // Leading whitespace forces quoting, then backslash gets escaped
    const result = yamlEscapeValueIfNeeded(' path\\to');
    expect(result).toContain('\\\\');
  });

  it('leaves mid-string double quotes unquoted', () => {
    const result = yamlEscapeValueIfNeeded('say "hi"');
    expect(result).toBe('say "hi"');
  });

  it('quotes strings starting with double quote', () => {
    const result = yamlEscapeValueIfNeeded('"quoted"');
    expect(result).toContain('\\"');
  });

  it('quotes strings with carriage return', () => {
    const result = yamlEscapeValueIfNeeded('line1\rline2');
    expect(result).toContain('\\r');
  });

  it('returns plain role names unquoted', () => {
    expect(yamlEscapeValueIfNeeded('button')).toBe('button');
  });

  it('quotes empty strings', () => {
    expect(yamlEscapeValueIfNeeded('')).toBe('""');
  });
});
