# Driver Shim Layer Specification

> **Purpose:** Specifies exactly what each shim must implement to replace
> Cypress's server-side functionality with browser-only alternatives.
> Each shim is a drop-in replacement for a server dependency used by the
> extracted Cypress driver.
>
> **Context:** The Cypress driver communicates with its Node.js server
> through two main channels: `Cypress.backend()` (RPC for server operations)
> and `Cypress.automation()` (browser automation protocol via CDP). Both
> return Promises. Our shims implement the same interfaces with browser-only
> alternatives.

---

## Table of Contents

1. [Backend Shim](#backend-shim)
2. [Automation Shim](#automation-shim)
3. [Navigation Shim](#navigation-shim)
4. [Config Shim](#config-shim)
5. [Runnable Shim](#runnable-shim)
6. [Event Forwarder Shim](#event-forwarder-shim)
7. [Phase 1 Scope vs. Future](#phase-1-scope-vs-future)

---

## Backend Shim

**Replaces:** `Cypress.backend(eventName, ...args) → Promise`

The driver calls `this.emit('backend:request', eventName, ...args, callback)`.
In Cypress, the EventManager forwards this to the server via socket.io.
The server dispatches to a handler and responds with `{ response }` or
`{ error }`.

Our shim intercepts the backend request at the `$Cypress` level before
it reaches any event system.

### Interface

```typescript
type BackendHandler = (
	eventName: string,
	...args: unknown[]
) => Promise<unknown>;
```

### Event handlers

#### `resolve:url`

**Called by:** `cy.visit()` (in `commands/navigation.ts`)

**Original behavior:** Server makes an HTTP request to the URL, follows
redirects, checks status code, returns metadata:

```typescript
{
	(url,
		originalUrl,
		cookies,
		redirects,
		contentType,
		filePath,
		isOkStatusCode,
		isHtml);
}
```

**Shim behavior (same-origin):**

```typescript
case 'resolve:url': {
  const [url] = args as [string];
  // For same-origin: resolve relative to current origin
  const resolved = new URL(url, window.location.origin).href;
  return {
    url: resolved,
    originalUrl: url,
    cookies: [],      // Cookies are handled via document.cookie
    redirects: [],    // No server-side redirect following
    contentType: 'text/html',
    filePath: null,
    isOkStatusCode: true,
    isHtml: true,
  };
}
```

**Limitations:** No redirect following, no status code checking, no
cookie jar. The iframe will handle redirects natively. Status codes
are not observable from the parent frame (same-origin only gives us
load/error events, not HTTP status).

#### `http:request`

**Called by:** `cy.request()` (API request without browser)

**Shim behavior:**

```typescript
case 'http:request': {
  const [options] = args as [RequestOptions];
  // Use fetch() — subject to CORS
  const response = await fetch(options.url, {
    method: options.method || 'GET',
    headers: options.headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: options.auth ? 'include' : 'same-origin',
  });
  return {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
    isOkStatusCode: response.ok,
    requestHeaders: options.headers || {},
    allRequestResponses: [],
  };
}
```

**Limitations:** CORS. In normal Cypress, `cy.request()` runs from
Node.js, bypassing CORS entirely. Our browser `fetch()` is subject
to CORS restrictions. For same-origin targets this is fine. For
cross-origin, requests will fail unless the target server sends
appropriate CORS headers. This is a known limitation documented to
users.

#### `reset:server:state`

**Called by:** Before each test (resets proxy/net-stubbing state)

**Shim behavior:** No-op. We have no proxy or net-stubbing state.

```typescript
case 'reset:server:state':
  return {};
```

#### `get:fixture`

**Called by:** `cy.fixture()`

**Shim behavior:**

```typescript
case 'get:fixture': {
  const [fixturePath, encoding] = args as [string, string?];
  // Fetch from a conventional fixtures path
  const response = await fetch(`/fixtures/${fixturePath}`);
  if (!response.ok) throw new Error(`Fixture not found: ${fixturePath}`);
  if (encoding === null) return await response.arrayBuffer();
  return await response.json().catch(() => response.text());
}
```

**Note:** Fixtures must be served as static files at `/<base>/fixtures/`.
For the demo, these can be placed in the toy app's file tree.

#### `run:privileged`

**Called by:** `cy.exec()`, `cy.task()`, `cy.readFile()`, `cy.writeFile()`

**Shim behavior:** Throw an informative error. These commands require
Node.js and cannot work in a browser.

```typescript
case 'run:privileged': {
  const [{ commandName }] = args as [{ commandName: string }];
  throw new Error(
    `\`cy.${commandName}()\` requires a Node.js server and is not available ` +
    `in browser-only mode. If you need this command, use the full cypress-cli ` +
    `tool instead of the browser demo.`
  );
}
```

#### `net` (net-stubbing events)

**Called by:** `cy.intercept()` driver-side coordination

**Shim behavior (phase 1):** Not registered. If `cy.intercept()` is
called, it throws at the command level ("not available in browser mode").

**Future (phase 2):** Route to Service Worker-based interception.

#### `preserve:run:state` / `save:session` / `get:session` / `clear:session`

**Shim behavior:** Use `sessionStorage` for session persistence within
the same browser tab. Use `IndexedDB` for cross-reload persistence.

```typescript
case 'save:session': {
  const [id, data] = args as [string, unknown];
  sessionStorage.setItem(`cy:session:${id}`, JSON.stringify(data));
  return {};
}
case 'get:session': {
  const [id] = args as [string];
  const data = sessionStorage.getItem(`cy:session:${id}`);
  return data ? JSON.parse(data) : null;
}
case 'clear:session': {
  const [id] = args as [string];
  if (id) sessionStorage.removeItem(`cy:session:${id}`);
  else {
    Object.keys(sessionStorage)
      .filter(k => k.startsWith('cy:session:'))
      .forEach(k => sessionStorage.removeItem(k));
  }
  return {};
}
```

#### `close:extra:targets`

**Called by:** Before each test (closes extra browser tabs via CDP)

**Shim behavior:** No-op. We don't control browser targets.

```typescript
case 'close:extra:targets':
  return {};
```

#### Unknown events

Any unhandled event throws an error identifying the event name:

```typescript
default:
  throw new Error(
    `Cypress.backend('${eventName}') is not available in browser mode. ` +
    `This may indicate a driver command that requires server support.`
  );
```

---

## Automation Shim

**Replaces:** `Cypress.automation(eventName, ...args) → Promise`

Automation calls normally go through socket.io to the server, which
delegates to the CDP automation client or Chrome extension. We replace
with `document.cookie` and other browser APIs.

### Interface

```typescript
type AutomationHandler = (
	eventName: string,
	...args: unknown[]
) => Promise<unknown>;
```

### Event handlers

#### `get:cookies`

```typescript
case 'get:cookies': {
  const [filter] = args as [{ domain?: string; name?: string }];
  const cookies = parseCookies(autDocument.cookie);
  return cookies.filter(c => {
    if (filter?.domain && c.domain !== filter.domain) return false;
    if (filter?.name && c.name !== filter.name) return false;
    return true;
  });
}
```

**Limitation:** `document.cookie` cannot access `httpOnly` cookies.
This is a browser security feature. The server's CDP-based approach
bypasses this. Document this as a known limitation.

#### `get:cookie`

```typescript
case 'get:cookie': {
  const [{ name, domain }] = args as [{ name: string; domain?: string }];
  const cookies = parseCookies(autDocument.cookie);
  return cookies.find(c => c.name === name) || null;
}
```

#### `set:cookie`

```typescript
case 'set:cookie': {
  const [cookie] = args as [CookieData];
  const parts = [`${cookie.name}=${cookie.value}`];
  if (cookie.path) parts.push(`path=${cookie.path}`);
  if (cookie.domain) parts.push(`domain=${cookie.domain}`);
  if (cookie.secure) parts.push('secure');
  if (cookie.sameSite) parts.push(`samesite=${cookie.sameSite}`);
  if (cookie.expiry) {
    parts.push(`expires=${new Date(cookie.expiry * 1000).toUTCString()}`);
  }
  autDocument.cookie = parts.join('; ');
  return cookie;
}
```

#### `clear:cookie`

```typescript
case 'clear:cookie': {
  const [{ name, domain, path }] = args as [{ name: string; domain?: string; path?: string }];
  const expiry = 'expires=Thu, 01 Jan 1970 00:00:00 GMT';
  const parts = [`${name}=; ${expiry}`];
  if (path) parts.push(`path=${path}`);
  if (domain) parts.push(`domain=${domain}`);
  autDocument.cookie = parts.join('; ');
  return null;
}
```

#### `clear:cookies`

```typescript
case 'clear:cookies': {
  const cookies = parseCookies(autDocument.cookie);
  for (const cookie of cookies) {
    autDocument.cookie = `${cookie.name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
  return [];
}
```

#### `take:screenshot`

```typescript
case 'take:screenshot':
  // Phase 1: not implemented
  throw new Error('Screenshots are not available in browser mode.');
  // Phase 2 option: use html2canvas library
```

#### `focus:browser:window`

```typescript
case 'focus:browser:window':
  window.focus();
  return {};
```

#### `reset:browser:state`

```typescript
case 'reset:browser:state': {
  // Clear cookies
  const cookies = parseCookies(autDocument.cookie);
  cookies.forEach(c => {
    autDocument.cookie = `${c.name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
  // Clear storage
  autWindow.localStorage.clear();
  autWindow.sessionStorage.clear();
  return {};
}
```

### Cookie parser utility

Both shims need a cookie parser:

```typescript
interface ParsedCookie {
	name: string;
	value: string;
	domain: string;
	path: string;
	secure: boolean;
	httpOnly: false; // Always false — we can't access httpOnly cookies
}

function parseCookies(cookieString: string): ParsedCookie[] {
	if (!cookieString) return [];
	return cookieString.split(';').map((pair) => {
		const [name, ...rest] = pair.trim().split('=');
		return {
			name: name.trim(),
			value: rest.join('='), // Value may contain '='
			domain: window.location.hostname,
			path: '/',
			secure: window.location.protocol === 'https:',
			httpOnly: false,
		};
	});
}
```

---

## Navigation Shim

**Replaces:** `cy.visit()`, `cy.go()`, `cy.reload()` server-side
navigation through the proxy.

In normal Cypress, `cy.visit()` calls `Cypress.backend('resolve:url')`
which makes the HTTP request from Node.js, then navigates the AUT
iframe to a proxied URL. Our shim navigates the iframe directly.

### `visit(url)`

```typescript
async visit(url: string, options?: VisitOptions): Promise<void> {
  const resolvedUrl = new URL(url, autIframe.contentWindow?.location.origin || window.location.origin).href;
  const timeout = options?.timeout || 30000;

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(
        `cy.visit('${url}') timed out after ${timeout}ms waiting for the page to load.`
      ));
    }, timeout);

    const onLoad = () => {
      clearTimeout(timer);
      autIframe.removeEventListener('load', onLoad);
      autIframe.removeEventListener('error', onError);

      // Re-inject Cypress reference into the new page
      const contentWindow = autIframe.contentWindow;
      if (contentWindow) {
        contentWindow.Cypress = window.Cypress;
      }

      resolve();
    };

    const onError = (event: Event) => {
      clearTimeout(timer);
      autIframe.removeEventListener('load', onLoad);
      autIframe.removeEventListener('error', onError);
      reject(new Error(`cy.visit('${url}') failed to load.`));
    };

    autIframe.addEventListener('load', onLoad);
    autIframe.addEventListener('error', onError);

    // Navigate
    autIframe.contentWindow!.location.href = resolvedUrl;
  });
}
```

### `go(direction)`

```typescript
async go(direction: 'back' | 'forward' | number): Promise<void> {
  const contentWindow = autIframe.contentWindow!;

  return new Promise<void>((resolve) => {
    const onLoad = () => {
      autIframe.removeEventListener('load', onLoad);
      resolve();
    };
    autIframe.addEventListener('load', onLoad);

    if (direction === 'back') contentWindow.history.back();
    else if (direction === 'forward') contentWindow.history.forward();
    else contentWindow.history.go(direction);

    // If it's a pushState page (SPA), the load event won't fire
    // Fall back to a short timeout
    setTimeout(() => {
      autIframe.removeEventListener('load', onLoad);
      resolve();
    }, 1000);
  });
}
```

### `reload()`

```typescript
async reload(): Promise<void> {
  return new Promise<void>((resolve) => {
    const onLoad = () => {
      autIframe.removeEventListener('load', onLoad);
      resolve();
    };
    autIframe.addEventListener('load', onLoad);
    autIframe.contentWindow!.location.reload();
  });
}
```

### Known limitations

| Behavior                      | Cypress (proxied)               | Our shim (same-origin)    |
| ----------------------------- | ------------------------------- | ------------------------- |
| Cross-origin navigation       | Works (proxy rewrites)          | Blocked by browser        |
| HTTP status code checking     | `backend('resolve:url')` checks | Not observable            |
| Redirect following            | Server follows, returns chain   | Browser follows natively  |
| `failOnStatusCode` option     | Compares response status        | Cannot implement          |
| Script injection on load      | Proxy injects into HTML         | Must re-inject after load |
| Cookie management on navigate | Server manages cookie jar       | Browser manages natively  |

---

## Config Shim

**Replaces:** `window.__CYPRESS_CONFIG__` and the config validation
pipeline.

The driver reads config values throughout its codebase via
`Cypress.config('key')`. We provide a static config object with
sensible defaults.

```typescript
function createDefaultConfig(): CypressConfig {
	return {
		// Identification
		projectName: 'cypress-cli-studio',
		version: '14.3.2',

		// Browser metadata
		browser: {
			name: 'chrome',
			displayName: detectBrowser(),
			version: detectBrowserVersion(),
			majorVersion: detectBrowserMajorVersion(),
			isHeadless: false,
			isHeaded: true,
			family: 'chromium',
		},
		platform: detectPlatform(),
		arch: detectArch(),

		// Testing type
		testingType: 'e2e',
		isTextTerminal: false,
		isInteractive: true,

		// Viewport
		viewportWidth: 1000,
		viewportHeight: 660,

		// Timeouts (these drive retry/actionability)
		defaultCommandTimeout: 4000,
		execTimeout: 60000,
		taskTimeout: 60000,
		pageLoadTimeout: 60000,
		requestTimeout: 5000,
		responseTimeout: 30000,

		// Retry behavior
		retries: {
			runMode: 0,
			openMode: 0,
		},

		// Behavior flags
		waitForAnimations: true,
		animationDistanceThreshold: 5,
		scrollBehavior: 'top',
		numTestsKeptInMemory: 0,

		// Base URL (set by studio UI)
		baseUrl: null,

		// Feature flags
		experimentalMemoryManagement: false,
		experimentalModifyObstructiveThirdPartyCode: false,

		// Namespace
		namespace: '__cypress',
	};
}
```

### Browser detection helpers

```typescript
function detectBrowser(): string {
	const ua = navigator.userAgent;
	if (ua.includes('Firefox')) return 'Firefox';
	if (ua.includes('Edg')) return 'Edge';
	if (ua.includes('Chrome')) return 'Chrome';
	if (ua.includes('Safari')) return 'Safari';
	return 'Unknown';
}
```

---

## Runnable Shim

**Replaces:** Mocha `Runnable`, `Test`, and `Suite` objects that the
driver reads from `state('runnable')`, `state('test')`, `state('suite')`.

### Fake Runnable

The most critical shim. The retry loop, command queue, and timeout
management all read from `state('runnable')`.

```typescript
interface FakeRunnable {
	// Properties read by the driver
	title: string;
	_timeout: number;
	_timer: ReturnType<typeof setTimeout> | null;
	isPending: () => boolean;
	fullTitle: () => string;
	titlePath: () => string[];

	// Methods called by the driver
	timeout: (ms?: number) => number | void;
	clearTimeout: () => void;
	resetTimeout: () => void;
	callback: (err?: Error) => void;
}

function createFakeRunnable(onError: (err: Error) => void): FakeRunnable {
	const runnable: FakeRunnable = {
		title: 'REPL Session',
		_timeout: 30000,
		_timer: null,

		isPending: () => false,

		fullTitle: () => 'REPL Session',

		titlePath: () => ['REPL Session'],

		timeout(ms?: number) {
			if (ms === undefined) return runnable._timeout;
			runnable._timeout = ms;
		},

		clearTimeout() {
			if (runnable._timer) {
				globalThis.clearTimeout(runnable._timer);
				runnable._timer = null;
			}
		},

		resetTimeout() {
			runnable.clearTimeout();
			if (runnable._timeout) {
				runnable._timer = globalThis.setTimeout(() => {
					runnable.callback(
						new Error(`Command timed out after ${runnable._timeout}ms.`),
					);
				}, runnable._timeout);
			}
		},

		callback(err?: Error) {
			runnable.clearTimeout();
			if (err) onError(err);
		},
	};

	return runnable;
}
```

### Fake Test

```typescript
function createFakeTest(): FakeTest {
	return {
		id: 'r1',
		title: 'REPL Session',
		fullTitle: () => 'REPL Session',
		titlePath: () => ['REPL Session'],
		state: 'passed',
		pending: false,
		body: '',
		type: 'test',
		order: 0,
		currentRetry: () => 0,
		retries: () => 0,
		err: null,
		_testConfig: {},
		cfg: {},
	};
}
```

### Fake Suite

```typescript
function createFakeSuite(): FakeSuite {
	return {
		id: 'r0',
		title: '',
		fullTitle: () => '',
		titlePath: () => [],
		root: true,
		type: 'suite',
		tests: [],
		suites: [],
		ctx: {},
	};
}
```

### Installation

After driver boot, populate state:

```typescript
const runnable = createFakeRunnable((err) => {
	queue.stop();
	emit('command:error', err);
});

state('runnable', runnable);
state('test', createFakeTest());
state('suite', createFakeSuite());
```

---

## Event Forwarder Shim

**Replaces:** The EventManager's socket.io forwarding.

In normal Cypress, certain driver events are forwarded to the server
via socket.io. Our shim captures these events and either:

- Routes them to our own handlers (for events we care about)
- Drops them (for events that are server-only concerns)

### Events to capture

| Event                | Action                                |
| -------------------- | ------------------------------------- |
| `backend:request`    | Route to backend shim                 |
| `automation:request` | Route to automation shim              |
| `log:added`          | Emit to studio UI (command log panel) |
| `log:changed`        | Emit to studio UI (command log panel) |
| `command:start`      | Emit to studio UI                     |
| `command:end`        | Emit to studio UI                     |
| `command:retry`      | Emit to studio UI                     |
| `page:loading`       | Track in state                        |
| `url:changed`        | Track in state                        |
| `viewport:changed`   | Track in state                        |

### Events to drop

| Event                                | Reason            |
| ------------------------------------ | ----------------- |
| `mocha`                              | No Mocha          |
| `recorder:frame`                     | No Test Replay    |
| `dev-server:on-spec-update`          | No dev server     |
| `script:error` (from server)         | No server scripts |
| `watched:file:changed` (from server) | No file watcher   |
| `cross:origin:*`                     | Same-origin only  |

---

## Phase 1 Scope vs. Future

### Phase 1 (browser-only, same-origin)

| Feature                                                | Status    |
| ------------------------------------------------------ | --------- |
| Backend shim (resolve:url, reset, close:extra:targets) | Implement |
| Automation shim (cookies via document.cookie)          | Implement |
| Navigation shim (visit, go, reload via iframe)         | Implement |
| Config shim (static defaults)                          | Implement |
| Runnable shim (fake Mocha objects)                     | Implement |
| Event forwarder (capture logs, drop server events)     | Implement |

### Phase 2 (Service Worker)

| Feature                           | Change                          |
| --------------------------------- | ------------------------------- |
| Backend shim: `net` events        | Route to SW fetch handler       |
| Navigation shim: script injection | SW intercepts HTML responses    |
| Navigation shim: header stripping | SW removes X-Frame-Options, CSP |
| Automation shim: screenshots      | html2canvas integration         |

### Phase 3 (Edge proxy)

| Feature                       | Change                              |
| ----------------------------- | ----------------------------------- |
| Backend shim: `resolve:url`   | Real HTTP request from proxy        |
| Backend shim: `http:request`  | Proxy bypasses CORS                 |
| Navigation shim: cross-origin | Proxy rewrites URLs for same-origin |
| Automation shim: cookies      | Proxy manages cookie jar            |
