# src/client/

> CLI client — one-shot commands sent to the daemon over a Unix socket.

## Responsibility

The client is a short-lived process. It:

1. Parses CLI arguments (minimist)
2. Validates them against the command's zod schema
3. Connects to the daemon's Unix socket
4. Sends the command as JSON
5. Waits for the response
6. Prints the result (aria snapshot, error, or export output)
7. Disconnects and exits

The client has **no state**. It doesn't know about browsers, Cypress, or
snapshots. It's a thin transport layer.

## Key Files (planned)

```
client/
├── index.ts          ← Entry point: parse args, find socket, send, print
├── connection.ts     ← Unix socket client (connect, send, receive, close)
├── commands.ts       ← Command schema registry (all commands + zod schemas)
├── command.ts        ← declareCommand helper + parseCommand
├── format.ts         ← Response formatting for terminal output
└── registry.ts       ← Session/socket discovery (~/.cypress-cli/<hash>/)
```

## Modeled After

Playwright's `packages/playwright-core/src/cli/client/`:

- `session.ts` → `Session.run()` connects to daemon, sends command, returns result
- `socketConnection.ts` → `SocketConnection` handles newline-delimited JSON over TCP
- `registry.ts` → discovers daemon sockets by workspace hash

## Communication Protocol

Newline-delimited JSON over Unix domain socket:

```
→ {"id":1,"method":"run","params":{"args":{"_":["click","e5"]}}}\n
← {"id":1,"result":{"success":true,"snapshot":"- main:\n  ..."}}\n
```

Connection is opened per-command and closed after the response. The daemon
handles multiple sequential connections but only one command executes at a time.

## Session Discovery

Sessions are stored as JSON config files:

```
~/.cypress-cli/
└── <workspace-hash>/
    ├── default.session      ← JSON: { socketPath, name, timestamp, ... }
    └── default.sock         ← Unix socket file
```

The client reads the `.session` file to find the socket path, then connects.
Multiple named sessions are supported (`-s mySession`).

## Error Handling

- **Daemon not running**: "No session running. Run `cypress-cli open` first."
- **Socket connection refused**: "Session socket exists but daemon is not responding. Run `cypress-cli open` to restart."
- **Command validation error**: Zod error message with which argument is missing/invalid
- **Command execution error**: Error message from Cypress + current snapshot

All errors exit with non-zero status code for scripting.
