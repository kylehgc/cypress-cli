# Browser Demo

This directory contains the browser-only `cypress-cli` demo. It runs entirely
client-side: the demo page hosts a same-origin toy app in an iframe, accepts
CLI-style commands in a REPL, renders aria snapshots, and generates Cypress
test code from the in-memory session history.

## Layout

```text
demo/
├── index.html          # Demo UI shell
├── dist/               # Built browser bundle
├── esbuild.demo.js     # Demo bundle build script
├── src/                # Browser demo runtime
└── toy-app/            # Same-origin fixture pages
```

## Build

```bash
npm run build:demo
```

This depends on the main project build because the demo imports the generated
`dist/injected.string.js` bundle.

## Serve

```bash
npm run serve:demo
```

Open `http://localhost:3000` and use the REPL at the bottom of the page.

## Suggested Validation Flow

1. Run `snapshot`.
2. Run `click e23` on the home page to trigger the status change.
3. Run `assert e21 have.text Hello!`.
4. Run `navigate form.html` and confirm the snapshot panel updates.
5. Run `navigate todo.html`, `type e21 Buy milk`, `click e22`, and `localstorage-list`.

Note: Ref numbers in the demo are offset by +2 from the real CLI because
the demo page's own document consumes `e1`/`e2`. The tree structure is
otherwise identical.
