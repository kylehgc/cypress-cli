import { describe, it, expect, vi, afterEach } from 'vitest';

import {
	Logger,
	createDaemonLogger,
	createClientLogger,
	parseLogLevel,
	LOG_LEVEL_ENV_VAR,
	type LogEntry,
} from '../../../src/shared/logger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock output stream that captures written data.
 */
function createMockOutput(): { write: ReturnType<typeof vi.fn>; lines: () => string[] } {
	const writeFn = vi.fn();
	return {
		write: writeFn,
		lines: () => writeFn.mock.calls.map((call: unknown[]) => String(call[0])),
	};
}

// ---------------------------------------------------------------------------
// Logger: level filtering
// ---------------------------------------------------------------------------

describe('Logger level filtering', () => {
	it('emits messages at or above the configured level', () => {
		const output = createMockOutput();
		const log = new Logger({ level: 'warn', format: 'human', output });

		log.error('err msg');
		log.warn('warn msg');
		log.info('info msg');
		log.debug('debug msg');

		expect(output.lines()).toHaveLength(2);
		expect(output.lines()[0]).toContain('err msg');
		expect(output.lines()[1]).toContain('warn msg');
	});

	it('emits all messages at debug level', () => {
		const output = createMockOutput();
		const log = new Logger({ level: 'debug', format: 'human', output });

		log.error('e');
		log.warn('w');
		log.info('i');
		log.debug('d');

		expect(output.lines()).toHaveLength(4);
	});

	it('emits only errors at error level', () => {
		const output = createMockOutput();
		const log = new Logger({ level: 'error', format: 'human', output });

		log.error('e');
		log.warn('w');
		log.info('i');
		log.debug('d');

		expect(output.lines()).toHaveLength(1);
		expect(output.lines()[0]).toContain('e');
	});

	it('defaults to info level', () => {
		const output = createMockOutput();
		const log = new Logger({ format: 'human', output });

		log.info('visible');
		log.debug('hidden');

		expect(output.lines()).toHaveLength(1);
		expect(output.lines()[0]).toContain('visible');
	});

	it('exposes current level via getter', () => {
		const log = new Logger({ level: 'debug' });
		expect(log.level).toBe('debug');
	});
});

// ---------------------------------------------------------------------------
// Logger: human format
// ---------------------------------------------------------------------------

describe('Logger human format', () => {
	it('prefixes lines with level label', () => {
		const output = createMockOutput();
		const log = new Logger({ level: 'debug', format: 'human', output });

		log.error('err');
		log.warn('wrn');
		log.info('inf');
		log.debug('dbg');

		expect(output.lines()[0]).toMatch(/^ERROR /);
		expect(output.lines()[1]).toMatch(/^WARN /);
		expect(output.lines()[2]).toMatch(/^INFO /);
		expect(output.lines()[3]).toMatch(/^DEBUG /);
	});

	it('includes component name when set', () => {
		const output = createMockOutput();
		const log = new Logger({ level: 'info', format: 'human', component: 'client', output });

		log.info('connected');

		expect(output.lines()[0]).toContain('[client]');
		expect(output.lines()[0]).toContain('connected');
	});

	it('omits component brackets when not set', () => {
		const output = createMockOutput();
		const log = new Logger({ level: 'info', format: 'human', output });

		log.info('hello');

		expect(output.lines()[0]).not.toContain('[');
		expect(output.lines()[0]).toBe('INFO hello\n');
	});

	it('appends key=value pairs from data', () => {
		const output = createMockOutput();
		const log = new Logger({ level: 'info', format: 'human', output });

		log.info('request', { method: 'click', ref: 'e5' });

		const line = output.lines()[0];
		expect(line).toContain('method=click');
		expect(line).toContain('ref=e5');
	});

	it('JSON-stringifies non-string data values', () => {
		const output = createMockOutput();
		const log = new Logger({ level: 'info', format: 'human', output });

		log.info('count', { total: 42 });

		expect(output.lines()[0]).toContain('total=42');
	});

	it('handles unserializable data gracefully in human mode', () => {
		const output = createMockOutput();
		const log = new Logger({ level: 'info', format: 'human', output });

		// Create circular reference
		const circular: Record<string, unknown> = {};
		circular.self = circular;

		log.info('problem', circular);

		const line = output.lines()[0];
		expect(line).toContain('problem');
		expect(line).toContain('[unserializable]');
	});

	it('terminates each line with newline', () => {
		const output = createMockOutput();
		const log = new Logger({ level: 'info', format: 'human', output });

		log.info('test');

		expect(output.lines()[0]).toMatch(/\n$/);
	});

	it('exposes format via getter', () => {
		const log = new Logger({ format: 'human' });
		expect(log.format).toBe('human');
	});
});

// ---------------------------------------------------------------------------
// Logger: JSON format
// ---------------------------------------------------------------------------

describe('Logger JSON format', () => {
	it('outputs valid JSON lines', () => {
		const output = createMockOutput();
		const log = new Logger({ level: 'info', format: 'json', output });

		log.info('test message');

		const parsed = JSON.parse(output.lines()[0]) as LogEntry;
		expect(parsed.level).toBe('info');
		expect(parsed.message).toBe('test message');
	});

	it('includes timestamp in ISO format', () => {
		const output = createMockOutput();
		const log = new Logger({ level: 'info', format: 'json', output });

		log.info('timestamped');

		const parsed = JSON.parse(output.lines()[0]) as LogEntry;
		expect(parsed.timestamp).toBeDefined();
		// ISO 8601 format check
		expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
	});

	it('includes component when set', () => {
		const output = createMockOutput();
		const log = new Logger({ level: 'info', format: 'json', component: 'daemon', output });

		log.info('started');

		const parsed = JSON.parse(output.lines()[0]) as LogEntry;
		expect(parsed.component).toBe('daemon');
	});

	it('omits component when not set', () => {
		const output = createMockOutput();
		const log = new Logger({ level: 'info', format: 'json', output });

		log.info('no component');

		const parsed = JSON.parse(output.lines()[0]) as LogEntry;
		expect(parsed.component).toBeUndefined();
	});

	it('includes extra data fields', () => {
		const output = createMockOutput();
		const log = new Logger({ level: 'info', format: 'json', output });

		log.info('request', { socketPath: '/tmp/test.sock', retries: 3 });

		const parsed = JSON.parse(output.lines()[0]) as LogEntry;
		expect(parsed.socketPath).toBe('/tmp/test.sock');
		expect(parsed.retries).toBe(3);
	});

	it('filters out reserved keys from data', () => {
		const output = createMockOutput();
		const log = new Logger({ level: 'info', format: 'json', component: 'test', output });

		log.info('original message', {
			timestamp: 'overwritten',
			level: 'overwritten',
			component: 'overwritten',
			message: 'overwritten',
			safeKey: 'kept',
		});

		const parsed = JSON.parse(output.lines()[0]) as LogEntry;
		expect(parsed.message).toBe('original message');
		expect(parsed.level).toBe('info');
		expect(parsed.component).toBe('test');
		expect(parsed.safeKey).toBe('kept');
	});

	it('handles unserializable data gracefully in JSON mode', () => {
		const output = createMockOutput();
		const log = new Logger({ level: 'info', format: 'json', output });

		// Create circular reference
		const circular: Record<string, unknown> = {};
		circular.self = circular;

		log.info('problem', circular);

		// Should still produce valid JSON with a fallback message
		const line = output.lines()[0];
		expect(line).toBeDefined();
		const parsed = JSON.parse(line);
		expect(parsed.message).toContain('problem');
	});

	it('terminates each entry with newline', () => {
		const output = createMockOutput();
		const log = new Logger({ level: 'info', format: 'json', output });

		log.info('test');

		expect(output.lines()[0]).toMatch(/\n$/);
	});

	it('exposes format via getter', () => {
		const log = new Logger({ format: 'json' });
		expect(log.format).toBe('json');
	});
});

// ---------------------------------------------------------------------------
// parseLogLevel
// ---------------------------------------------------------------------------

describe('parseLogLevel', () => {
	it('parses valid log levels', () => {
		expect(parseLogLevel('error')).toBe('error');
		expect(parseLogLevel('warn')).toBe('warn');
		expect(parseLogLevel('info')).toBe('info');
		expect(parseLogLevel('debug')).toBe('debug');
	});

	it('is case-insensitive', () => {
		expect(parseLogLevel('DEBUG')).toBe('debug');
		expect(parseLogLevel('Error')).toBe('error');
		expect(parseLogLevel('WARN')).toBe('warn');
	});

	it('trims whitespace', () => {
		expect(parseLogLevel('  info  ')).toBe('info');
	});

	it('returns default for undefined', () => {
		expect(parseLogLevel(undefined)).toBe('info');
	});

	it('returns default for empty string', () => {
		expect(parseLogLevel('')).toBe('info');
	});

	it('returns default for invalid value', () => {
		expect(parseLogLevel('verbose')).toBe('info');
		expect(parseLogLevel('trace')).toBe('info');
	});

	it('uses custom default when specified', () => {
		expect(parseLogLevel('invalid', 'error')).toBe('error');
		expect(parseLogLevel(undefined, 'debug')).toBe('debug');
	});
});

// ---------------------------------------------------------------------------
// createDaemonLogger
// ---------------------------------------------------------------------------

describe('createDaemonLogger', () => {
	const originalEnv = process.env[LOG_LEVEL_ENV_VAR];

	afterEach(() => {
		if (originalEnv === undefined) {
			delete process.env[LOG_LEVEL_ENV_VAR];
		} else {
			process.env[LOG_LEVEL_ENV_VAR] = originalEnv;
		}
	});

	it('creates a JSON-format logger', () => {
		const output = createMockOutput();
		const log = createDaemonLogger({ output });
		expect(log.format).toBe('json');
	});

	it('defaults to info level when env var is not set', () => {
		delete process.env[LOG_LEVEL_ENV_VAR];
		const output = createMockOutput();
		const log = createDaemonLogger({ output });
		expect(log.level).toBe('info');
	});

	it('reads level from CYPRESS_CLI_LOG_LEVEL env var', () => {
		process.env[LOG_LEVEL_ENV_VAR] = 'debug';
		const output = createMockOutput();
		const log = createDaemonLogger({ output });
		expect(log.level).toBe('debug');
	});

	it('ignores invalid env var values and defaults to info', () => {
		process.env[LOG_LEVEL_ENV_VAR] = 'banana';
		const output = createMockOutput();
		const log = createDaemonLogger({ output });
		expect(log.level).toBe('info');
	});
});

// ---------------------------------------------------------------------------
// createClientLogger
// ---------------------------------------------------------------------------

describe('createClientLogger', () => {
	it('creates a human-format logger', () => {
		const output = createMockOutput();
		const log = createClientLogger(false, { output });
		expect(log.format).toBe('human');
	});

	it('uses info level when verbose is false', () => {
		const output = createMockOutput();
		const log = createClientLogger(false, { output });
		expect(log.level).toBe('info');
	});

	it('uses debug level when verbose is true', () => {
		const output = createMockOutput();
		const log = createClientLogger(true, { output });
		expect(log.level).toBe('debug');
	});

	it('defaults to info level when verbose is undefined', () => {
		const output = createMockOutput();
		const log = createClientLogger(undefined, { output });
		expect(log.level).toBe('info');
	});
});
