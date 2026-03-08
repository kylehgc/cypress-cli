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

export {
	CommandQueue,
	QueueError,
	type QueuedCommand,
	type CommandResult,
} from './commandQueue.js';

export {
	CommandHistory,
	HistoryError,
	type HistoryEntry,
	type SerializedHistory,
} from './history.js';

export {
	Session,
	SessionMap,
	SessionError,
	type SessionState,
	type SessionConfig,
	type SerializedSession,
} from './session.js';

export {
	createGetCommandHandler,
	createCommandResultHandler,
	createTaskHandlers,
	type TaskHandlers,
	type GetCommandResult,
	type PollSentinel,
	type StopSentinel,
} from './taskHandler.js';

export {
	Daemon,
	DaemonError,
	resolveSocketDir,
	isSocketAlive,
	cleanStaleSockets,
	type DaemonOptions,
} from './daemon.js';
export {
	runDaemonProcess,
	parseDaemonProcessArgs,
	type DaemonProcessOptions,
} from './main.js';

export {
	resolveSessionsDir,
	saveSession,
	loadSession,
	listPersistedSessions,
	deletePersistedSession,
} from './persistence.js';
