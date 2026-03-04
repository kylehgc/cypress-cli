# Package & Build Specification

> What goes in package.json, tsconfig.json, and build scripts.

## package.json

```jsonc
{
	"name": "cypress-cli",
	"version": "0.1.0",
	"description": "CLI tool for REPL-like LLM interactions with Cypress tests via Playwright's aria snapshot",
	"type": "module",
	"bin": {
		"cypress-cli": "./dist/client/index.js",
	},
	"scripts": {
		"build": "npm run build:iife && npm run build:ts",
		"build:iife": "node esbuild.config.js",
		"build:ts": "tsc",
		"test": "vitest run",
		"test:watch": "vitest --watch",
		"test:unit": "vitest run tests/unit/",
		"test:integration": "vitest run tests/integration/",
		"test:e2e": "vitest run tests/e2e/",
		"typecheck": "tsc --noEmit",
		"lint": "eslint src/ tests/",
		"clean": "rm -rf dist/",
	},
	"engines": {
		"node": ">=18.0.0",
	},
	"peerDependencies": {
		"cypress": ">=12.0.0",
	},
	"dependencies": {
		"minimist": "1.2.8",
		"zod": "3.24.2",
	},
	"devDependencies": {
		"@types/minimist": "1.2.5",
		"@types/node": "22.13.5",
		"cypress": "14.3.2",
		"esbuild": "0.25.0",
		"eslint": "9.21.0",
		"happy-dom": "17.4.4",
		"typescript": "5.7.3",
		"vitest": "3.0.7",
	},
	"files": ["dist/", "README.md", "LICENSE"],
	"license": "MIT",
	"repository": {
		"type": "git",
		"url": "https://github.com/kylehgc/cypress-cli",
	},
}
```

### Dependency Rationale

| Dependency       | Why                                                                        | Size  |
| ---------------- | -------------------------------------------------------------------------- | ----- |
| `minimist`       | CLI argument parsing. Tiny (~400 lines, 0 deps). Same as Playwright.       | ~14KB |
| `zod`            | Command schema validation. Typed validation that doubles as documentation. | ~56KB |
| `cypress` (peer) | Must be installed in the consumer's project. We don't bundle it.           | —     |

### Dev Dependency Rationale

| Dependency        | Why                                                      |
| ----------------- | -------------------------------------------------------- |
| `esbuild`         | Bundles injected/ into IIFE. Fast, no native binaries.   |
| `typescript`      | Type checking and ESM compilation.                       |
| `vitest`          | Test runner. ESM-native, fast.                           |
| `happy-dom`       | Lightweight DOM implementation for injected/ unit tests. |
| `eslint`          | Linting.                                                 |
| `@types/node`     | Node.js type definitions.                                |
| `@types/minimist` | minimist type definitions.                               |

## tsconfig.json

```jsonc
{
	"compilerOptions": {
		"target": "ESNext",
		"module": "NodeNext",
		"moduleResolution": "NodeNext",
		"strict": true,
		"esModuleInterop": true,
		"skipLibCheck": true,
		"forceConsistentCasingInFileNames": true,
		"resolveJsonModule": true,
		"declaration": true,
		"declarationMap": true,
		"sourceMap": true,
		"outDir": "dist",
		"rootDir": "src",
		"types": ["node"],
	},
	"include": ["src/**/*.ts"],
	"exclude": [
		"src/injected/**", // Built separately by esbuild
		"src/cypress/driver.cy.ts", // Cypress test file, not compiled by tsc
		"node_modules",
		"dist",
		"tests",
	],
}
```

### Key decisions:

- **`module: "NodeNext"`** — ESM with `.js` extensions in imports. This is the
  correct setting for ESM packages targeting Node.js.
- **`src/injected/` excluded** — Built by esbuild as IIFE, not by tsc as ESM.
  It targets the browser, not Node.js.
- **`driver.cy.ts` excluded** — This is a Cypress test file. It will be
  processed by Cypress's own TypeScript handling (or bundled separately).

## tsconfig for injected (optional)

If type checking the injected code separately:

```jsonc
// src/injected/tsconfig.json
{
	"compilerOptions": {
		"target": "ES2022",
		"module": "ESNext",
		"moduleResolution": "bundler",
		"strict": true,
		"lib": ["ES2022", "DOM", "DOM.Iterable"],
		"noEmit": true,
	},
	"include": ["./**/*.ts"],
}
```

This lets `tsc --noEmit -p src/injected/tsconfig.json` type-check the browser
code with DOM types available, without producing output (esbuild handles that).

## esbuild.config.js

```javascript
import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';

// Build the injected IIFE bundle
const result = await build({
	entryPoints: ['src/injected/index.ts'],
	bundle: true,
	format: 'iife',
	globalName: '__cypressCliAriaSnapshot',
	outfile: 'dist/injected.iife.js',
	platform: 'browser',
	target: 'es2022',
	minify: false, // Keep readable for debugging
	sourcemap: false, // Not useful inside eval()
	write: true,
});

// Also generate a string constant module that embeds the IIFE
const iifeContent = await import('node:fs/promises').then((fs) =>
	fs.readFile('dist/injected.iife.js', 'utf-8'),
);

await writeFile(
	'dist/injected.string.js',
	`export const INJECTED_IIFE = ${JSON.stringify(iifeContent)};\n`,
);

console.log('Built injected IIFE bundle');
```

The second step generates `dist/injected.string.js` — a module that exports the
IIFE as a string constant. The daemon/driver can import this directly instead of
reading from disk at runtime.

## vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['tests/**/*.test.ts'],
		environmentMatchGlobs: [
			['tests/unit/injected/**', 'happy-dom'],
			['tests/unit/daemon/**', 'node'],
			['tests/unit/client/**', 'node'],
			['tests/unit/codegen/**', 'node'],
			['tests/unit/protocol/**', 'node'],
			['tests/integration/**', 'node'],
			['tests/e2e/**', 'node'],
		],
		testTimeout: 10_000,
		hookTimeout: 10_000,
	},
});
```

## Build Pipeline

```
npm run build
  │
  ├── npm run build:iife
  │     └── esbuild src/injected/index.ts → dist/injected.iife.js
  │                                        → dist/injected.string.js
  │
  └── npm run build:ts
        └── tsc → dist/**/*.js (ESM modules)
                  dist/**/*.d.ts (type declarations)
                  dist/**/*.js.map (source maps)
```

Output structure:

```
dist/
├── injected.iife.js          ← IIFE bundle for browser eval()
├── injected.string.js        ← IIFE as exportable string constant
├── client/
│   ├── index.js              ← CLI entry point (bin)
│   ├── connection.js
│   ├── commands.js
│   └── ...
├── daemon/
│   ├── index.js
│   ├── commandQueue.js
│   └── ...
├── codegen/
│   ├── index.js
│   ├── selector.js
│   └── ...
└── browser/
    ├── index.js
    ├── refMap.js
    └── ...
```

## Node.js Version

Minimum Node.js 18 (LTS). This gives us:

- Native ESM support
- `node:fs/promises`, `node:net`, `node:path` prefixed imports
- `globalThis`, `structuredClone`
- `Array.prototype.at()`

We don't need Node.js 22+ features.
