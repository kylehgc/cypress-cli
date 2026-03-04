/**
 * Socket protocol message types for client↔daemon communication.
 *
 * Wire format: newline-delimited JSON over Unix domain sockets.
 * Each message is a single JSON object followed by '\n'.
 */

/**
 * Methods supported by the protocol.
 * - "run": execute a CLI command
 * - "stop": shut down the daemon and Cypress session
 */
export type MessageMethod = 'run' | 'stop';

/**
 * Message sent from the CLI client to the daemon.
 *
 * Example:
 * ```json
 * { "id": 1, "method": "run", "params": { "args": { "_": ["click", "e5"] } } }
 * ```
 */
export interface CommandMessage {
	id: number;
	method: MessageMethod;
	params: {
		args: {
			_: string[];
			[key: string]: unknown;
		};
	};
}

/**
 * Successful response sent from the daemon to the CLI client.
 *
 * Example:
 * ```json
 * { "id": 1, "result": { "success": true, "snapshot": "..." } }
 * ```
 */
export interface ResponseMessage {
	id: number;
	result: {
		success: boolean;
		snapshot?: string;
		selector?: string;
		cypressCommand?: string;
	};
}

/**
 * Error response sent from the daemon to the CLI client.
 *
 * Example:
 * ```json
 * { "id": 1, "error": "Element ref e5 not found in current snapshot" }
 * ```
 */
export interface ErrorMessage {
	id: number;
	error: string;
}

/**
 * A message received over the socket — either a response or an error.
 */
export type DaemonMessage = ResponseMessage | ErrorMessage;

/**
 * Any message that can be sent over the socket.
 */
export type ProtocolMessage = CommandMessage | ResponseMessage | ErrorMessage;

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
 */
export function isResponseMessage(
	message: DaemonMessage,
): message is ResponseMessage {
	return 'result' in message && typeof message.result === 'object';
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
 * Deserializes a single JSON line into a protocol message.
 *
 * @param line - A single line of JSON (without trailing newline)
 * @returns The parsed protocol message
 * @throws {ProtocolError} If the line is not valid JSON or lacks required fields
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

	if (typeof parsed !== 'object' || parsed === null) {
		throw new ProtocolError('Protocol message must be a JSON object.');
	}

	const obj = parsed as Record<string, unknown>;
	if (typeof obj.id !== 'number') {
		throw new ProtocolError('Protocol message must have a numeric "id" field.');
	}

	// Structural minimum validated (object with numeric id). Callers use type
	// guards (isErrorMessage, isResponseMessage) for further discrimination.
	return parsed as unknown as ProtocolMessage;
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
