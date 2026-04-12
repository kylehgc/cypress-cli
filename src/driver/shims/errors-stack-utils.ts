// Stack utils shim for @packages/errors/src/stackUtils
export function getStackLines(stack?: string): any {
	return splitStack(stack)[1];
}

export function replacedStack(err: Error, stack: string): any {
	err.stack = stack;
	return err;
}

export function stackWithoutMessage(err: any): any {
	const [, stackLines] = splitStack(
		typeof err === 'string' ? err : err.stack || '',
	);
	return unsplitStack([], stackLines);
}

export function splitStack(stack?: string): any {
	const lines = typeof stack === 'string' ? stack.split('\n') : [];
	const firstStackLineIndex = lines.findIndex((line) =>
		stackLineRegex.test(line),
	);

	if (firstStackLineIndex === -1) {
		return [lines, []];
	}

	return [
		lines.slice(0, firstStackLineIndex),
		lines.slice(firstStackLineIndex),
	];
}

export function unsplitStack(
	messageLines: any = [],
	stackLines: any = [],
): any {
	const normalizedMessageLines = Array.isArray(messageLines)
		? messageLines
		: messageLines
			? [messageLines]
			: [];
	const normalizedStackLines = Array.isArray(stackLines)
		? stackLines
		: stackLines
			? [stackLines]
			: [];

	return [...normalizedMessageLines, ...normalizedStackLines].join('\n');
}

export const stackLineRegex = /^(\s*at\s+.*)$/;
