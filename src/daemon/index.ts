/**
 * Daemon process: manages sessions, command queue, and IPC.
 */
export {
	type CommandMessage,
	type ResponseMessage,
	type ErrorMessage,
	type DaemonMessage,
	type ProtocolMessage,
	type MessageMethod,
	isErrorMessage,
	isResponseMessage,
	serializeMessage,
	deserializeMessage,
	ProtocolError,
} from './protocol.js';

export {
	SocketConnection,
	ConnectionError,
	type MessageHandler,
	type CloseHandler,
	type ErrorHandler,
} from './connection.js';
