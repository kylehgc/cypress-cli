# src/shared/

Shared infrastructure used across all components (client, daemon, cypress).

## Modules

- **errors.ts** — Typed error hierarchy (`CypressCliError` base class and
  subclasses), plus serialization helpers for crossing the socket boundary.
- **logger.ts** — Structured logger with JSON output for daemon (stderr) and
  human-readable output for client. Log levels: error, warn, info, debug.

## Error Hierarchy

```
CypressCliError (base)
├── ConnectionError   — Socket / IPC failures
├── TimeoutError      — Operation timeouts
├── ValidationError   — Input validation failures
├── CommandError      — Cypress command execution failures
└── SessionError      — Session lifecycle errors
```

## Logger Modes

| Context | Format         | Destination |
|---------|---------------|-------------|
| Daemon  | JSON (structured) | stderr  |
| Client  | Human-readable    | stderr  |

Log level is controlled by:
- `--verbose` / `-v` flag on the CLI (sets client log level to `debug`)
- `CYPRESS_CLI_LOG_LEVEL` env var for the daemon (`error`, `warn`, `info`, `debug`)
