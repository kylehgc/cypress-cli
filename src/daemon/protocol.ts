/**
 * Socket protocol message types for client↔daemon communication.
 *
 * Wire format: newline-delimited JSON over Unix domain sockets.
 * Each message is a single JSON object followed by '\n'.
 */

import { z } from 'zod';

/**
 * Methods supported by the protocol.
 * - "run": execute a CLI command
 * - "stop": shut down the daemon and Cypress session
 */
export type MessageMethod = 'run' | 'stop';

// ---------------------------------------------------------------------------
// Zod schemas — used by deserializeMessage for runtime validation
// ---------------------------------------------------------------------------

const commandMessageSchema = z.object({
	id: z.number(),
	method: z.enum(['run', 'stop']),
	params: z.object({
		args: z
			.object({
				_: z.array(z.string()),
			})
			.passthrough(),
	}),
});

const responseMessageSchema = z.object({
	id: z.number(),
	result: z.object({
		success: z.boolean(),
		status: z.string().optional(),
		sessionId: z.string().optional(),
		url: z.string().optional(),
		browser: z.string().optional(),
		headed: z.boolean().optional(),
		snapshot: z.string().optional(),
		title: z.string().optional(),
		error: z.string().optional(),
		selector: z.string().optional(),
		cypressCommand: z.string().optional(),
		evalResult: z.string().optional(),
		testFile: z.string().optional(),
		filePath: z.string().optional(),
		snapshotFilePath: z.string().optional(),
		totalTests: z.number().optional(),
		totalPassed: z.number().optional(),
		totalFailed: z.number().optional(),
		failures: z
			.array(z.object({ test: z.string(), error: z.string() }))
			.optional(),
		duration: z.number().optional(),
	}),
});

const errorMessageSchema = z.object({
	id: z.number(),
	error: z.string(),
});

const protocolMessageSchema = z.union([
	commandMessageSchema,
	responseMessageSchema,
	errorMessageSchema,
]);

/**
 * Message sent from the CLI client to the daemon.
 *
 * Example:
 * ```json
 * { "id": 1, "method": "run", "params": { "args": { "_": ["click", "e5"] } } }
 * ```
 */
export type CommandMessage = z.infer<typeof commandMessageSchema>;

/**
 * Successful response sent from the daemon to the CLI client.
 *
 * Example:
 * ```json
 * { "id": 1, "result": { "success": true, "snapshot": "..." } }
 * ```
 */
export type ResponseMessage = z.infer<typeof responseMessageSchema>;

/**
 * Error response sent from the daemon to the CLI client.
 *
 * Example:
 * ```json
 * { "id": 1, "error": "Element ref e5 not found in current snapshot" }
 * ```
 */
export type ErrorMessage = z.infer<typeof errorMessageSchema>;

/**
 * A message received over the socket — either a response or an error.
 */
export type DaemonMessage = ResponseMessage | ErrorMessage;

/**
 * Any message that can be sent over the socket.
 */
export type ProtocolMessage = z.infer<typeof protocolMessageSchema>;

/**
 * Type guard: checks whether a message is an ErrorMessage.
 */
export function isErrorMessage(
	message: DaemonMessage,
): message is ErrorMessage {
	return 'error' in message && typeof message.error === 'string';
}

/**
 * Type guard: checks whether a message is a ResponseMessage.
 * Validates that result is a non-null, non-array object with a boolean success field.
 */
export function isResponseMessage(
	message: DaemonMessage,
): message is ResponseMessage {
	if (!('result' in message)) {
		return false;
	}
	const result = (message as Record<string, unknown>).result;
	return (
		result !== null &&
		typeof result === 'object' &&
		!Array.isArray(result) &&
		typeof (result as Record<string, unknown>).success === 'boolean'
	);
}

/**
 * Serializes a protocol message to a newline-delimited JSON string.
 *
 * @param message - The message to serialize
 * @returns JSON string terminated with '\n'
 */
export function serializeMessage(message: ProtocolMessage): string {
	return JSON.stringify(message) + '\n';
}

/**
 * Deserializes a single JSON line into a validated protocol message.
 * Uses zod schemas for runtime validation of the wire format.
 *
 * @param line - A single line of JSON (without trailing newline)
 * @returns The parsed and validated protocol message
 * @throws {ProtocolError} If the line is not valid JSON or fails schema validation
 */
export function deserializeMessage(line: string): ProtocolMessage {
	const trimmed = line.trim();
	if (trimmed.length === 0) {
		throw new ProtocolError('Empty message received.');
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		throw new ProtocolError(
			`Invalid JSON in protocol message: ${trimmed.slice(0, 100)}`,
		);
	}

	const result = protocolMessageSchema.safeParse(parsed);
	if (!result.success) {
		const issues = result.error.issues
			.map((issue: z.ZodIssue) => `${issue.path.join('.')}: ${issue.message}`)
			.join('; ');
		throw new ProtocolError(`Invalid protocol message: ${issues}`);
	}

	return result.data;
}

/**
 * Error thrown when protocol-level deserialization or validation fails.
 */
export class ProtocolError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ProtocolError';
	}
}
