// Fake Mocha runnable/test/suite for browser mode
// The driver needs state('runnable') to unblock command queue + retry loop

export interface FakeRunnable {
	title: string;
	_timeout: number;
	_timer: ReturnType<typeof setTimeout> | null;
	_slow: number;
	fn: (...args: any[]) => void;
	isPending: () => boolean;
	fullTitle: () => string;
	titlePath: () => string[];
	timeout: (ms?: number) => number | FakeRunnable;
	slow: (ms?: number) => number | FakeRunnable;
	clearTimeout: () => void;
	resetTimeout: () => void;
	callback: (err?: Error) => void;
	ctx: Record<string, any>;
	parent: any;
	type: string;
}

export function createFakeRunnable(
	onError: (err: Error) => void,
): FakeRunnable {
	const runnable: FakeRunnable = {
		title: 'REPL Session',
		_timeout: 30000,
		_timer: null,
		_slow: 75,
		type: 'test',
		fn: () => {},

		isPending: () => false,
		fullTitle: () => 'REPL Session',
		titlePath: () => ['REPL Session'],

		timeout(ms?: number) {
			if (ms === undefined) return runnable._timeout;
			runnable._timeout = ms;
			return runnable;
		},

		slow(ms?: number) {
			if (ms === undefined) return runnable._slow;
			runnable._slow = ms;
			return runnable;
		},

		clearTimeout() {
			if (runnable._timer) {
				globalThis.clearTimeout(runnable._timer);
				runnable._timer = null;
			}
		},

		resetTimeout() {
			runnable.clearTimeout();
			if (runnable._timeout) {
				runnable._timer = globalThis.setTimeout(() => {
					runnable.callback(
						new Error(`Command timed out after ${runnable._timeout}ms.`),
					);
				}, runnable._timeout);
			}
		},

		callback(err?: Error) {
			runnable.clearTimeout();
			if (err) onError(err);
		},

		ctx: {},
		parent: null,
	};

	// Make ctx.currentTest point back so currentRetry works
	runnable.ctx = {
		currentTest: runnable,
		test: runnable,
	};

	return runnable;
}

export interface FakeTest {
	id: string;
	title: string;
	fullTitle: () => string;
	titlePath: () => string[];
	state: string;
	pending: boolean;
	body: string;
	type: string;
	order: number;
	currentRetry: () => number;
	retries: () => number;
	err: Error | null;
	_testConfig: Record<string, any>;
	_currentRetry: number;
	cfg: Record<string, any>;
	ctx: Record<string, any>;
	parent: any;
}

export function createFakeTest(): FakeTest {
	return {
		id: 'r1',
		title: 'REPL Session',
		fullTitle: () => 'REPL Session',
		titlePath: () => ['REPL Session'],
		state: 'passed',
		pending: false,
		body: '',
		type: 'test',
		order: 0,
		currentRetry: () => 0,
		retries: () => 0,
		err: null,
		_testConfig: {},
		_currentRetry: 0,
		cfg: {},
		ctx: {},
		parent: null,
	};
}

export interface FakeSuite {
	id: string;
	title: string;
	fullTitle: () => string;
	titlePath: () => string[];
	root: boolean;
	type: string;
	tests: any[];
	suites: any[];
	ctx: Record<string, any>;
}

export function createFakeSuite(): FakeSuite {
	return {
		id: 'r0',
		title: '',
		fullTitle: () => '',
		titlePath: () => [],
		root: true,
		type: 'suite',
		tests: [],
		suites: [],
		ctx: {},
	};
}
