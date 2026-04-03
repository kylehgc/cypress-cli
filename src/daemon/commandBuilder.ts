import path from 'node:path';

import type { CommandMessage } from './protocol.js';
import type { QueuedCommand } from './commandQueue.js';

/**
 * Infer export file format from explicit options or file extension.
 */
export function inferExportFormat(
	options: Record<string, unknown>,
): 'js' | 'ts' {
	if (options.format === 'js' || options.format === 'ts') {
		return options.format;
	}

	if (typeof options.file === 'string') {
		if (options.file.endsWith('.ts')) {
			return 'ts';
		}
		if (options.file.endsWith('.js')) {
			return 'js';
		}
	}

	return 'ts';
}

/**
 * Translate parsed CLI args into a queued daemon command.
 */
export function buildQueuedCommand(
	id: number,
	args: CommandMessage['params']['args'],
): QueuedCommand {
	const [action, ...positionals] = args._;
	const options = stripPositionals(args);

	switch (action) {
		case 'click':
		case 'dblclick':
		case 'rightclick':
		case 'clear':
		case 'check':
		case 'uncheck':
		case 'focus':
		case 'blur':
		case 'hover':
		case 'waitfor':
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && { ref: positionals[0] }),
				},
				options,
			);
		case 'type':
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && { ref: positionals[0] }),
					...(joinText(positionals.slice(1)) !== undefined && {
						text: joinText(positionals.slice(1)),
					}),
				},
				options,
			);
		case 'fill':
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && { ref: positionals[0] }),
					...(joinText(positionals.slice(1)) !== undefined && {
						text: joinText(positionals.slice(1)),
					}),
				},
				options,
			);
		case 'select':
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && { ref: positionals[0] }),
					...(joinText(positionals.slice(1)) !== undefined && {
						text: joinText(positionals.slice(1)),
					}),
				},
				options,
			);
		case 'scrollto':
			if (positionals[0] && looksLikeRef(positionals[0])) {
				return withOptions({ id, action, ref: positionals[0] }, options);
			}
			return withOptions(
				{
					id,
					action,
					...(joinText(positionals) !== undefined && {
						text: joinText(positionals),
					}),
				},
				options,
			);
		case 'navigate': {
			const navigateText = joinText(stripPlaceholder(positionals));
			return withOptions(
				{
					id,
					action,
					...(navigateText !== undefined && {
						text: navigateText,
					}),
				},
				options,
			);
		}
		case 'back':
		case 'forward':
		case 'reload':
		case 'snapshot':
			return withOptions({ id, action }, options);
		case 'press':
		case 'wait':
		case 'run-code':
			return withOptions(
				{
					id,
					action,
					...(joinText(positionals) !== undefined && {
						text: joinText(positionals),
					}),
				},
				options,
			);
		case 'eval': {
			const lastToken = positionals[positionals.length - 1];
			const hasTrailingRef =
				positionals.length >= 2 &&
				lastToken !== undefined &&
				looksLikeRef(lastToken);
			const exprParts = hasTrailingRef ? positionals.slice(0, -1) : positionals;
			const exprText = joinText(exprParts);
			return withOptions(
				{
					id,
					action,
					...(exprText !== undefined && { text: exprText }),
					...(hasTrailingRef && { ref: lastToken }),
				},
				options,
			);
		}
		case 'assert': {
			const legacyChainer =
				typeof options['chainer'] === 'string' ? options['chainer'] : undefined;
			const [ref, second, ...rest] = positionals;
			const chainer = legacyChainer ?? second;
			const valueParts = legacyChainer ? [second, ...rest] : rest;
			return withOptions(
				{
					id,
					action,
					...(ref !== undefined && { ref }),
					...(joinText(valueParts) !== undefined && {
						text: joinText(valueParts),
					}),
				},
				{
					...options,
					...(chainer !== undefined && { chainer }),
				},
			);
		}
		case 'asserturl':
		case 'asserttitle': {
			const legacyChainer =
				typeof options['chainer'] === 'string' ? options['chainer'] : undefined;
			const normalized = stripPlaceholder(positionals);
			const [second, ...rest] = normalized;
			const chainer = legacyChainer ?? second;
			const valueParts = legacyChainer ? normalized : rest;
			return withOptions(
				{
					id,
					action,
					...(joinText(valueParts) !== undefined && {
						text: joinText(valueParts),
					}),
				},
				{
					...options,
					...(chainer !== undefined && { chainer }),
				},
			);
		}
		case 'network':
		case 'cookie-list':
		case 'cookie-clear':
			return withOptions({ id, action }, options);
		case 'state-save':
			return withOptions(
				{ id, action },
				{
					...options,
					...(positionals[0] !== undefined && {
						filename: positionals[0],
					}),
				},
			);
		case 'state-load':
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && {
						text: positionals[0],
					}),
				},
				options,
			);
		case 'intercept':
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && {
						text: positionals[0],
					}),
				},
				options,
			);
		case 'unintercept':
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && {
						text: positionals[0],
					}),
				},
				options,
			);
		case 'waitforresponse':
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && {
						text: positionals[0],
					}),
				},
				options,
			);
		case 'cookie-get':
		case 'cookie-delete':
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && {
						text: positionals[0],
					}),
				},
				options,
			);
		case 'cookie-set':
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && {
						text: positionals[0],
					}),
				},
				{
					...options,
					...(joinText(positionals.slice(1)) !== undefined && {
						value: joinText(positionals.slice(1)),
					}),
				},
			);
		case 'dialog-accept':
			return withOptions(
				{
					id,
					action,
					...(joinText(positionals) !== undefined && {
						text: joinText(positionals),
					}),
				},
				options,
			);
		case 'dialog-dismiss':
			return withOptions({ id, action }, options);
		case 'resize':
			return withOptions(
				{ id, action },
				{
					...options,
					...(positionals[0] !== undefined && {
						width: positionals[0],
					}),
					...(positionals[1] !== undefined && {
						height: positionals[1],
					}),
				},
			);
		case 'screenshot':
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && { ref: positionals[0] }),
				},
				options,
			);
		case 'drag':
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && { ref: positionals[0] }),
					...(positionals[1] !== undefined && { text: positionals[1] }),
				},
				options,
			);
		case 'upload': {
			const filePath = joinText(positionals.slice(1));
			if (filePath !== undefined) {
				const resolved = path.resolve(filePath);
				const cwd = process.cwd();
				if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
					throw new Error(
						`Upload path "${filePath}" resolves outside the working directory. ` +
							'Use a relative path within the project.',
					);
				}
			}
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && { ref: positionals[0] }),
					...(filePath !== undefined && { text: filePath }),
				},
				options,
			);
		}
		default:
			return withOptions(
				{
					id,
					action,
					...(positionals[0] !== undefined && { ref: positionals[0] }),
					...(joinText(positionals.slice(1)) !== undefined && {
						text: joinText(positionals.slice(1)),
					}),
				},
				options,
			);
	}
}

/**
 * Strip positional arg storage from yargs-parsed args.
 */
export function stripPositionals(
	args: CommandMessage['params']['args'],
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(args).filter(([key]) => key !== '_'),
	);
}

/**
 * Attach options to a queued command only when present.
 */
export function withOptions(
	command: QueuedCommand,
	options: Record<string, unknown>,
): QueuedCommand {
	return Object.keys(options).length > 0
		? {
				...command,
				options,
			}
		: command;
}

/**
 * Join CLI text parts into a normalized string.
 */
export function joinText(parts: string[]): string | undefined {
	const text = parts.join(' ').trim();
	return text.length > 0 ? text : undefined;
}

/**
 * Remove the placeholder positional used by asserturl/asserttitle parsing.
 */
export function stripPlaceholder(parts: string[]): string[] {
	return parts[0] === '_' ? parts.slice(1) : parts;
}

/**
 * Detect aria snapshot element refs.
 */
export function looksLikeRef(value: string): boolean {
	return /^e\d+$/.test(value);
}
