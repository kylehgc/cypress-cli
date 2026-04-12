# Driver Build & Bundle Strategy

> **Purpose:** How to vendor, build, and bundle the extracted Cypress driver
> for browser use. Covers the copy process, dependency management, esbuild
> configuration, tree-shaking, and bundle size analysis.

---

## Table of Contents

1. [Vendoring Process](#vendoring-process)
2. [Source Organization](#source-organization)
3. [Dependency Resolution](#dependency-resolution)
4. [Build Configuration](#build-configuration)
5. [Import Path Rewriting](#import-path-rewriting)
6. [Bundle Size Budget](#bundle-size-budget)
7. [Development Workflow](#development-workflow)
8. [Upgrade Process](#upgrade-process)

---

## Vendoring Process

We copy source files from `cypress-io/cypress` at a specific release
tag into our repository. This is a one-time copy with tracked
modifications.

### Pin to a release

```bash
# Clone the cypress repo at the v14.3.2 tag
git clone --depth 1 --branch v14.3.2 https://github.com/cypress-io/cypress.git /tmp/cypress-source
```

### Copy the driver source

```bash
SRC=/tmp/cypress-source/packages/driver/src
DST=src/driver/vendor

mkdir -p $DST

# Core command infrastructure
cp -r $SRC/cypress/cy.ts          $DST/cypress/
cp    $SRC/cypress/command.ts      $DST/cypress/
cp    $SRC/cypress/command_queue.ts $DST/cypress/
cp    $SRC/cypress/chainer.ts      $DST/cypress/
cp    $SRC/cypress/error_utils.ts  $DST/cypress/
cp    $SRC/cypress/log.ts          $DST/cypress/
cp    $SRC/cypress/state.ts        $DST/cypress/
cp    $SRC/cypress/cypress.ts      $DST/cypress/
cp    $SRC/cypress/events.ts       $DST/cypress/

# Actionability & retry
cp    $SRC/cy/actionability.ts     $DST/cy/
cp    $SRC/cy/assertions.ts        $DST/cy/
cp    $SRC/cy/retries.ts           $DST/cy/
cp    $SRC/cy/ensures.ts           $DST/cy/
cp    $SRC/cy/focused.ts           $DST/cy/

# Input simulation
cp -r $SRC/cy/keyboard            $DST/cy/
cp    $SRC/cy/mouse.ts            $DST/cy/

# Commands — actions
cp -r $SRC/cy/commands/actions     $DST/cy/commands/

# Commands — querying
cp -r $SRC/cy/commands/querying    $DST/cy/commands/

# Commands — other browser-safe
cp    $SRC/cy/commands/traversals.ts $DST/cy/commands/
cp    $SRC/cy/commands/connectors.ts $DST/cy/commands/
cp    $SRC/cy/commands/asserting.ts  $DST/cy/commands/
cp    $SRC/cy/commands/aliasing.ts   $DST/cy/commands/
cp    $SRC/cy/commands/waiting.ts    $DST/cy/commands/
cp    $SRC/cy/commands/window.ts     $DST/cy/commands/
cp    $SRC/cy/commands/misc.ts       $DST/cy/commands/
cp    $SRC/cy/commands/storage.ts    $DST/cy/commands/

# DOM utilities
cp -r $SRC/dom                     $DST/

# Config helpers
cp    $SRC/config/jquery.ts        $DST/config/
cp    $SRC/config/lodash.ts        $DST/config/
```

### What NOT to copy

```
DO NOT COPY:
  cypress/runner.ts           # Mocha wrapper (2600 LOC) — not needed
  cypress/mocha.ts            # Mocha patching (500 LOC) — not needed
  cy/commands/navigation.ts   # Replace with shim
  cy/commands/cookies.ts      # Replace with shim
  cy/commands/request.ts      # Replace with shim
  cy/commands/task.ts         # Replace with shim
  cy/commands/exec.ts         # Replace with shim
  cy/commands/files.ts        # Replace with shim
  cy/commands/sessions/       # Complex, not needed for REPL
  cy/commands/origin/         # Cross-origin support, phase 2+
  cy/net-stubbing/            # Replace with Service Worker (phase 2)
  cross-origin/               # Spec bridge communicator, phase 2+
```

### Track modifications

After the initial copy, create a VENDORED.md in the driver directory:

```markdown
# Vendored Cypress Driver Source

- **Source:** github.com/cypress-io/cypress
- **Tag:** v14.3.2
- **Date:** 2026-04-10
- **License:** MIT

## Modifications from upstream

- cypress/cy.ts: Removed Mocha/Runner imports and references
- cypress/command_queue.ts: Removed runnable guard
- cy/retries.ts: Removed state('runnable') guard
- [list all changes]
```

---

## Source Organization

```
src/driver/
├── vendor/                     ← Copied from Cypress (modifications tracked)
│   ├── cypress/                ← Core driver infrastructure
│   │   ├── cypress.ts          ← $Cypress class (modified)
│   │   ├── cy.ts               ← $Cy class (heavily modified)
│   │   ├── command.ts          ← $Command class (unmodified)
│   │   ├── command_queue.ts    ← CommandQueue (modified)
│   │   ├── chainer.ts          ← Chainer (unmodified)
│   │   ├── error_utils.ts      ← Error helpers (unmodified)
│   │   ├── log.ts              ← Log creation (unmodified)
│   │   ├── state.ts            ← State getter/setter (unmodified)
│   │   └── events.ts           ← Event system (unmodified)
│   ├── cy/                     ← Command implementations
│   │   ├── actionability.ts    ← Actionability engine (unmodified)
│   │   ├── assertions.ts       ← Assertion integration (unmodified)
│   │   ├── retries.ts          ← Retry loop (modified)
│   │   ├── ensures.ts          ← Ensure checks (unmodified)
│   │   ├── focused.ts          ← Focus tracking (unmodified)
│   │   ├── keyboard/           ← Keyboard simulation (unmodified)
│   │   ├── mouse.ts            ← Mouse simulation (unmodified)
│   │   └── commands/           ← All command implementations
│   │       ├── actions/        ← click, type, check, etc. (unmodified)
│   │       ├── querying/       ← get, contains (unmodified)
│   │       ├── traversals.ts   ← (unmodified)
│   │       ├── connectors.ts   ← (unmodified)
│   │       ├── asserting.ts    ← (unmodified)
│   │       ├── aliasing.ts     ← (unmodified)
│   │       ├── waiting.ts      ← (unmodified)
│   │       ├── window.ts       ← (unmodified)
│   │       ├── misc.ts         ← (unmodified)
│   │       └── storage.ts      ← (unmodified)
│   ├── dom/                    ← DOM utilities (unmodified)
│   └── config/                 ← jQuery/Lodash config (unmodified)
│
├── shims/                      ← Our code: browser replacements
│   ├── backend.ts              ← Replaces Cypress.backend()
│   ├── automation.ts           ← Replaces Cypress.automation()
│   ├── navigation.ts           ← cy.visit/go/reload via iframe
│   ├── config.ts               ← Default config values
│   ├── runnable.ts             ← Fake Mocha Runnable/Test/Suite
│   └── events.ts               ← No-op event forwarder
│
├── commands/                   ← Our code: browser-mode command overrides
│   ├── navigation.ts           ← visit/go/reload using iframe.location
│   └── cookies.ts              ← Cookies via document.cookie
│
├── index.ts                    ← CypressLite entry point
├── VENDORED.md                 ← Upstream tracking document
└── tsconfig.json               ← TypeScript config for driver directory
```

---

## Dependency Resolution

The vendored code imports from several external packages. We need to
resolve each one for the browser bundle.

### Direct dependencies (must bundle)

| Package       | Import pattern in driver                                        | Resolution                                                                         |
| ------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `jquery`      | `import $ from 'jquery'`                                        | Bundle. ~87KB unmin, ~30KB gzip. Used in hundreds of callsites.                    |
| `bluebird`    | `import Bluebird from 'bluebird'`                               | Bundle. ~72KB unmin, ~17KB gzip. Promise extensions used everywhere.               |
| `lodash`      | `import _ from 'lodash'` or `import { defaults } from 'lodash'` | Bundle lodash-es for tree-shaking, or bundle full lodash. ~70KB unmin, ~25KB gzip. |
| `chai`        | `import { expect } from 'chai'`                                 | Bundle. ~38KB unmin, ~15KB gzip. Powers `.should()`.                               |
| `chai-jquery` | `import chaiJquery from 'chai-jquery'`                          | Bundle. Small (~5KB). Extends Chai for jQuery assertions.                          |

### Internal Cypress packages referenced

| Package                  | Import pattern              | Resolution                                                      |
| ------------------------ | --------------------------- | --------------------------------------------------------------- |
| `@packages/errors`       | Error message templates     | Inline the messages we need, or create a minimal error registry |
| `@packages/types`        | TypeScript type definitions | Copy type files needed for compilation                          |
| `@packages/config`       | Config validation           | Replace with our config shim                                    |
| `@packages/driver/types` | Internal driver types       | Included in the vendor copy                                     |

### Polyfills / globals assumed

| Global                  | Used for                        | Resolution                             |
| ----------------------- | ------------------------------- | -------------------------------------- |
| `window`                | DOM access                      | Available in browser                   |
| `document`              | DOM access                      | Available in browser                   |
| `Promise`               | Async (Bluebird overrides)      | Bluebird sets itself as global Promise |
| `requestAnimationFrame` | Animation detection             | Available in browser                   |
| `MutationObserver`      | DOM change detection            | Available in browser                   |
| `IntersectionObserver`  | Viewport detection              | Available in browser                   |
| `fetch`                 | HTTP requests (cy.request shim) | Available in modern browsers           |

### Dependencies NOT needed

| Package                          | Why it exists in Cypress   | Why we don't need it |
| -------------------------------- | -------------------------- | -------------------- |
| `mocha`                          | Test framework             | Removed              |
| `sinon` / `@sinonjs/fake-timers` | `cy.clock()` / `cy.tick()` | Optional (phase 2)   |
| `react` / `react-dom`            | Reporter UI                | Not in driver        |
| `mobx`                           | State management for UI    | Not in driver        |
| `socket.io-client`               | Server communication       | Replaced by shims    |

---

## Build Configuration

### esbuild config

```javascript
// esbuild.driver.js
import esbuild from 'esbuild';

await esbuild.build({
	entryPoints: ['src/driver/index.ts'],
	bundle: true,
	format: 'esm',
	target: 'es2022',
	platform: 'browser',
	outfile: 'dist/cypress-driver.js',

	// Bundle all dependencies (no externals)
	external: [],

	// Node.js globals that some deps reference
	define: {
		'process.env.NODE_ENV': '"production"',
		'process.env.DEBUG': '""',
		global: 'globalThis',
	},

	// Source maps for debugging
	sourcemap: true,

	// Minification for production
	minify: process.env.NODE_ENV === 'production',

	// Replace node: protocol imports
	alias: {
		path: 'path-browserify',
		events: 'eventemitter3',
		// Add more as discovered during build
	},

	// Handle CommonJS modules
	mainFields: ['browser', 'module', 'main'],

	// Log warnings about browser compatibility
	logLevel: 'warning',
});
```

### TypeScript config for driver

```json
// src/driver/tsconfig.json
{
	"compilerOptions": {
		"target": "ES2022",
		"module": "ESNext",
		"moduleResolution": "bundler",
		"lib": ["ES2022", "DOM", "DOM.Iterable"],
		"strict": true,
		"esModuleInterop": true,
		"allowSyntheticDefaultImports": true,
		"skipLibCheck": true,
		"noEmit": true,
		"paths": {
			"@packages/errors": ["./shims/errors"],
			"@packages/types": ["./vendor/types"],
			"@packages/config": ["./shims/config"]
		}
	},
	"include": ["vendor/**/*", "shims/**/*", "commands/**/*", "index.ts"]
}
```

### npm scripts

```json
{
	"scripts": {
		"build:driver": "node esbuild.driver.js",
		"build:demo": "node esbuild.demo.js",
		"build:all": "npm run build && npm run build:driver && npm run build:demo"
	}
}
```

---

## Import Path Rewriting

The vendored Cypress code uses import paths relative to the driver
package root and references internal Cypress packages with
`@packages/` prefix. These need to be resolved for our build.

### `@packages/*` imports

Found in the driver source:

```typescript
import { errByPath } from '@packages/errors';
import type { CypressConfig } from '@packages/types';
import { validate } from '@packages/config';
```

**Strategy:** Use esbuild's `alias` or TypeScript `paths` to redirect:

```javascript
// esbuild alias
alias: {
  '@packages/errors': './src/driver/shims/errors.ts',
  '@packages/types': './src/driver/vendor/types/index.ts',
  '@packages/config': './src/driver/shims/config.ts',
}
```

### Relative imports within the driver

The driver's internal imports use relative paths:

```typescript
import { $Cy } from './cy';
import { CommandQueue } from './command_queue';
import { actionability } from '../cy/actionability';
```

**Strategy:** These work as-is because we preserve the directory
structure. No rewriting needed.

### Node.js built-in imports

Some Cypress code or dependencies may reference Node.js builtins:

```typescript
import path from 'path'; // Used in error_utils for path formatting
import { EventEmitter } from 'events'; // Base class for event system
```

**Strategy:** Use browser polyfills:

```javascript
alias: {
  'path': 'path-browserify',    // ~2KB
  'events': 'eventemitter3',    // ~3KB, or use the browser's EventTarget
}
```

If only `path.basename()` and `path.join()` are used, a small inline
shim is simpler than a full polyfill:

```typescript
// shims/path.ts
export function basename(p: string) {
	return p.split('/').pop() || '';
}
export function join(...parts: string[]) {
	return parts.join('/').replace(/\/+/g, '/');
}
```

---

## Bundle Size Budget

### Target

**Under 200KB gzipped** (including all dependencies).

For context:

- React is ~42KB gzipped
- Vue is ~33KB gzipped
- Svelte runtime is ~2KB gzipped
- The Tier 1 demo bundle is ~35KB gzipped

A dev tool loaded once per session can be larger than a production
UI library. 200KB is generous but achievable.

### Estimated breakdown

| Component                                    | Unmin      | Min+gzip   |
| -------------------------------------------- | ---------- | ---------- |
| Driver core (cy.ts, command_queue, commands) | ~90KB      | ~20KB      |
| DOM utilities (dom/)                         | ~40KB      | ~10KB      |
| Actionability + retry                        | ~15KB      | ~4KB       |
| Keyboard + Mouse                             | ~30KB      | ~7KB       |
| Error utilities                              | ~10KB      | ~3KB       |
| Our shims                                    | ~5KB       | ~2KB       |
| jQuery 3.x                                   | ~87KB      | ~30KB      |
| Bluebird 3.x                                 | ~72KB      | ~17KB      |
| Lodash (tree-shaken)                         | ~30KB      | ~10KB      |
| Chai + chai-jquery                           | ~43KB      | ~16KB      |
| EventEmitter polyfill                        | ~3KB       | ~1KB       |
| **Total**                                    | **~425KB** | **~120KB** |

This is well under the 200KB budget.

### Reduction opportunities (post-launch)

| Optimization                                   | Savings    | Effort                       |
| ---------------------------------------------- | ---------- | ---------------------------- |
| Replace jQuery with minimal DOM helpers        | ~30KB gzip | High (hundreds of callsites) |
| Replace Bluebird with native Promise + helpers | ~17KB gzip | High (every async path)      |
| Tree-shake Lodash more aggressively            | ~5KB gzip  | Medium                       |
| Replace Chai with lightweight assertion lib    | ~10KB gzip | High (assertion pattern)     |

These are optimizations for later. The initial bundle at ~120KB gzip
is already very reasonable.

---

## Development Workflow

### Initial setup

```bash
# 1. Clone Cypress source at pinned version
git clone --depth 1 --branch v14.3.2 \
  https://github.com/cypress-io/cypress.git /tmp/cypress-source

# 2. Run the copy script (to be authored)
node scripts/vendor-driver.js

# 3. Install additional dependencies
npm install jquery bluebird chai chai-jquery

# 4. Build
npm run build:driver

# 5. Test (unit tests for shims)
npx vitest run tests/unit/driver/
```

### Making changes to vendored code

1. Edit the file in `src/driver/vendor/`
2. Add a comment at the modification site: `// MODIFIED: <reason>`
3. Update `VENDORED.md` with the change description
4. Commit with message prefix: `refactor(driver):` or `fix(driver):`

### Testing approach

- **Shim tests:** Unit tests for each shim (backend, automation,
  navigation, config, runnable) with mocked iframe
- **Integration tests:** Boot the driver in jsdom or a real browser,
  execute basic commands against a test HTML document
- **Demo tests:** Run the demo site, execute commands, verify results
  match real CLI output (existing cross-validation process)

---

## Upgrade Process

When Cypress releases a new version with driver changes we want:

### Diffing

```bash
# 1. Clone both versions
git clone --depth 1 --branch v14.3.2 \
  https://github.com/cypress-io/cypress.git /tmp/cypress-old
git clone --depth 1 --branch v14.4.0 \
  https://github.com/cypress-io/cypress.git /tmp/cypress-new

# 2. Diff the driver source
diff -r /tmp/cypress-old/packages/driver/src /tmp/cypress-new/packages/driver/src \
  --exclude='*.test.*' --exclude='*.spec.*' \
  > driver-diff.patch

# 3. Review changes relevant to our vendored files
# Focus on: cy/, cypress/, dom/
```

### Applying changes

1. Review the diff for each modified file
2. For unmodified vendored files: apply the patch directly
3. For modified vendored files: manually merge, preserving our
   modifications
4. Update `VENDORED.md` with new version and merge notes
5. Run full test suite
6. Update the pinned version tag

### Cadence

- Check quarterly for Cypress releases
- Prioritize security fixes and bug fixes in actionability/retry
- Skip changes to modules we don't vendor (net-stubbing, sessions,
  cross-origin, runner, mocha)
