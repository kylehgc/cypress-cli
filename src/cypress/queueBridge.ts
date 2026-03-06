/**
 * Queue bridge: lightweight IPC server that bridges the command queue
 * from the launcher process to the Cypress config subprocess.
 *
 * Cypress 14 loads the config file in a child process (fork), so the
 * in-memory CommandQueue isn't directly accessible. This bridge creates
 * a Unix domain socket server that task handlers in the config file can
 * connect to for getCommand/commandResult operations.
 *
 * Protocol: newline-delimited JSON over a Unix domain socket.
 */

import net from 'node:net';
import fs from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';

import type { CommandQueue } from '../daemon/commandQueue.js';
import type { CommandResult } from '../daemon/commandQueue.js';
import { createTaskHandlers } from '../daemon/taskHandler.js';

// ---------------------------------------------------------------------------
// Bridge server (launcher/parent process)
// ---------------------------------------------------------------------------

/**
 * A queue bridge server that exposes the command queue over a Unix socket
 * for the Cypress config subprocess to consume.
 */
export class QueueBridge {
	private _server: net.Server | null = null;
	private _socketPath: string;
	private _queue: CommandQueue;
	private _pollTimeout: number;

	constructor(socketPath: string, queue: CommandQueue, pollTimeout: number) {
		this._socketPath = socketPath;
		this._queue = queue;
		this._pollTimeout = pollTimeout;
	}

	/**
	 * Start listening on the Unix domain socket.
	 */
	async start(): Promise<void> {
		// Clean up stale socket
		try {
			await fs.unlink(this._socketPath);
		} catch {
			// Ignore if doesn't exist
		}

		const handlers = createTaskHandlers(this._queue, this._pollTimeout);

		return new Promise<void>((resolve, reject) => {
			this._server = net.createServer((socket) => {
				let buffer = '';
				const decoder = new StringDecoder('utf-8');

				socket.on('data', (chunk: Buffer | string) => {
					const decoded =
						typeof chunk === 'string' ? chunk : decoder.write(chunk);
					buffer += decoded;

					let newlineIndex: number;
					while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
						const line = buffer.slice(0, newlineIndex);
						buffer = buffer.slice(newlineIndex + 1);
						this._handleMessage(socket, line, handlers);
					}
				});

				socket.on('error', () => {
					// Client disconnected — ignore
				});
			});

			this._server.on('error', (err) => {
				reject(err);
			});

			this._server.listen(this._socketPath, () => {
				resolve();
			});
		});
	}

	/**
	 * Stop the bridge server and clean up.
	 */
	async stop(): Promise<void> {
		if (this._server) {
			await new Promise<void>((resolve) => {
				this._server!.close(() => resolve());
			});
			this._server = null;
		}
		try {
			await fs.unlink(this._socketPath);
		} catch {
			// Best-effort
		}
	}

	get socketPath(): string {
		return this._socketPath;
	}

	private _handleMessage(
		socket: net.Socket,
		line: string,
		handlers: { getCommand: () => Promise<unknown>; commandResult: (result: CommandResult) => boolean },
	): void {
		let parsed: { type: string; payload?: unknown };
		try {
			parsed = JSON.parse(line);
		} catch {
			return;
		}

		if (parsed.type === 'getCommand') {
			handlers
				.getCommand()
				.then((result) => {
					const response = JSON.stringify({ type: 'getCommand', result }) + '\n';
					socket.write(response);
				})
				.catch((err) => {
					const response =
						JSON.stringify({
							type: 'getCommand',
							error: err instanceof Error ? err.message : String(err),
						}) + '\n';
					socket.write(response);
				});
		} else if (parsed.type === 'commandResult') {
			try {
				const ack = handlers.commandResult(parsed.payload as CommandResult);
				const response = JSON.stringify({ type: 'commandResult', result: ack }) + '\n';
				socket.write(response);
			} catch (err) {
				const response =
					JSON.stringify({
						type: 'commandResult',
						error: err instanceof Error ? err.message : String(err),
					}) + '\n';
				socket.write(response);
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Bridge client code (generated into the Cypress config file)
// ---------------------------------------------------------------------------

/**
 * Returns JavaScript source code that creates setupNodeEvents using the
 * bridge socket. This code runs in the Cypress config subprocess.
 */
export function generateBridgeClientCode(bridgeSocketPath: string): string {
	const escapedPath = JSON.stringify(bridgeSocketPath);

	return `
function createBridgeSetupNodeEvents() {
  const net = require('net');

  function sendRequest(type, payload) {
    return new Promise(function(resolve, reject) {
      const socket = net.createConnection(${escapedPath});
      let buffer = '';

      socket.on('connect', function() {
        socket.write(JSON.stringify({ type: type, payload: payload }) + '\\n');
      });

      socket.on('data', function(chunk) {
        buffer += chunk.toString();
        const idx = buffer.indexOf('\\n');
        if (idx !== -1) {
          const line = buffer.slice(0, idx);
          try {
            resolve(JSON.parse(line));
          } catch (e) {
            reject(e);
          }
          socket.destroy();
        }
      });

      socket.on('error', function(err) {
        reject(err);
      });

      socket.setTimeout(120000);
      socket.on('timeout', function() {
        reject(new Error('Bridge socket timed out'));
        socket.destroy();
      });
    });
  }

  return function setupNodeEvents(on, config) {
    on('task', {
      getCommand: function() {
        return sendRequest('getCommand').then(function(resp) {
          if (resp.error) throw new Error(resp.error);
          return resp.result;
        });
      },
      commandResult: function(result) {
        // Wait for the bridge to acknowledge the result before proceeding
        return sendRequest('commandResult', result).then(function(resp) {
          if (resp && resp.error) throw new Error(resp.error);
          return true;
        });
      }
    });
    return config;
  };
}
`;
}
