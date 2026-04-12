// @packages/errors shim for browser mode
export function errByPath(path: string, args?: Record<string, unknown>): Error {
	let argStr = '';
	if (args) {
		try {
			argStr = ` — ${JSON.stringify(args)}`;
		} catch {
			argStr = ' — [unserializable args]';
		}
	}
	const err = new Error(`Cypress error: ${path}${argStr}`);
	err.name = 'CypressError';
	return err;
}

export function getError(path: string, ...args: unknown[]): Error {
	return errByPath(path, args[0] as Record<string, unknown>);
}

export function throwErr(path: string, args?: Record<string, unknown>): never {
	throw errByPath(path, args);
}

export function stripAnsi(str: string): string {
	return str.replace(/\x1B\[[0-9;]*m/g, '');
}

export default { errByPath, getError, throwErr, stripAnsi };
