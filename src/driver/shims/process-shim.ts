import Buffer from './buffer';

// Process shim for browser — injected by esbuild
export const process = globalThis.process || {
	env: { NODE_ENV: 'production', DEBUG: '' },
	pid: 0,
	versions: {},
	platform: 'browser',
	cwd: () => '/',
	stdout: { write() {} },
	stderr: { write() {} },
	nextTick: (fn: Function, ...args: any[]) => setTimeout(() => fn(...args), 0),
	version: 'v0.0.0',
	argv: [],
};

if (!globalThis.process) {
	(globalThis as any).process = process;
}

if (!(globalThis as any).Buffer) {
	(globalThis as any).Buffer = Buffer;
}
