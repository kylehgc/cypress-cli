/**
 * Error thrown for daemon lifecycle and socket-management failures.
 */
export class DaemonError extends Error {
	override name = 'DaemonError';
}
