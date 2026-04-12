// CypressLite — Browser-only Cypress driver entry point
import $ from 'jquery';
import {
	createFakeRunnable,
	createFakeTest,
	createFakeSuite,
} from './shims/runnable.js';

// We dynamically import the vendored $Cypress class
// This gets the main driver class which creates cy, commands, etc.
import $Cypress from './vendor/cypress.js';

export class CypressLite {
	private Cypress: any;
	private cy: any;

	constructor(private autIframe: HTMLIFrameElement) {}

	async boot(): Promise<void> {
		// 1. Create config
		const config = this.createConfig();

		// 2. Create Cypress instance and expose as global
		this.Cypress = $Cypress.create(config);
		(window as any).Cypress = this.Cypress;

		// 3. Wire backend/automation shims via event interception
		this.wireShims();

		const $autIframe = $(this.autIframe);
		const specReady = new Promise<void>((resolve) => {
			this.Cypress.initialize({
				$autIframe,
				onSpecReady: resolve,
			});
		});

		// 4. Call onSpecWindow (creates cy, commands, keyboard, mouse)
		// We pass an empty scripts array — no spec files to eval
		this.Cypress.onSpecWindow(window, []);
		await specReady;
		this.cy = this.Cypress.cy;

		// 5. Set fake runnable to unblock command queue
		const state = this.Cypress.state;
		state('runnable', this.createRunnable());
		state('test', createFakeTest());
		state('suite', createFakeSuite());
	}

	async run(fn: (cy: any) => void): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const state = this.Cypress.state;
			const runnable = this.createRunnable();

			this.cy.setRunnable(runnable);
			state('test', createFakeTest());
			state('suite', createFakeSuite());

			const onFail = (err: Error) => {
				this.Cypress.off('fail', onFail);
				reject(err);
			};

			this.Cypress.on('fail', onFail);

			fn(this.cy);

			const queuePromise = state('promise');

			if (queuePromise && typeof queuePromise.then === 'function') {
				queuePromise
					.then(() => {
						this.Cypress.off('fail', onFail);
						resolve();
					})
					.catch((err: Error) => {
						this.Cypress.off('fail', onFail);
						reject(err);
					});

				return;
			}

			this.Cypress.off('fail', onFail);
			resolve();
		});
	}

	private createRunnable() {
		return createFakeRunnable((err) => {
			console.error('Command error:', err);
		});
	}

	private detectBrowser(): {
		name: string;
		displayName: string;
		version: string;
		majorVersion: number;
		isHeadless: boolean;
		isHeaded: boolean;
		family: string;
	} {
		const ua = navigator.userAgent;
		let name = 'unknown';
		let displayName = 'Unknown';
		let family = 'unknown';

		// Prefer NavigatorUAData (Chromium 90+)
		const uaData = (navigator as any).userAgentData;
		if (uaData?.brands) {
			const brands = uaData.brands as Array<{
				brand: string;
				version: string;
			}>;
			const edge = brands.find((b) => b.brand === 'Microsoft Edge');
			const chrome = brands.find((b) => b.brand === 'Google Chrome');
			const chromium = brands.find((b) => b.brand === 'Chromium');
			if (edge) {
				name = 'edge';
				displayName = 'Edge';
				family = 'chromium';
			} else if (chrome) {
				name = 'chrome';
				displayName = 'Chrome';
				family = 'chromium';
			} else if (chromium) {
				name = 'chromium';
				displayName = 'Chromium';
				family = 'chromium';
			}
		}

		// UA string fallback
		if (name === 'unknown') {
			if (/Firefox\//.test(ua)) {
				name = 'firefox';
				displayName = 'Firefox';
				family = 'firefox';
			} else if (/Edg\//.test(ua)) {
				name = 'edge';
				displayName = 'Edge';
				family = 'chromium';
			} else if (/Safari\/.*Version\//.test(ua) && !/Chrome\//.test(ua)) {
				name = 'webkit';
				displayName = 'Safari';
				family = 'webkit';
			} else if (/Chrome\//.test(ua)) {
				name = 'chrome';
				displayName = 'Chrome';
				family = 'chromium';
			}
		}

		const version =
			ua.match(/(?:Chrome|Firefox|Edg|Version)\/(\S+)/)?.[1] || 'unknown';
		const majorVersion = parseInt(version) || 0;

		return {
			name,
			displayName,
			version,
			majorVersion,
			isHeadless: false,
			isHeaded: true,
			family,
		};
	}

	private detectPlatform(): 'darwin' | 'win32' | 'linux' {
		const uaData = (navigator as any).userAgentData;
		const platformStr: string = (
			uaData?.platform ||
			navigator.platform ||
			''
		).toLowerCase();

		if (/mac|darwin/.test(platformStr)) return 'darwin';
		if (/win/.test(platformStr)) return 'win32';
		if (/linux|x11|cros|android/.test(platformStr)) return 'linux';
		return 'linux';
	}

	private detectArch(): string {
		const uaData = (navigator as any).userAgentData;
		if (uaData?.architecture) return uaData.architecture;

		const ua = navigator.userAgent;
		if (/arm64|aarch64/i.test(ua)) return 'arm64';
		if (/x86_64|win64|x64|amd64/i.test(ua)) return 'x64';
		return 'unknown';
	}

	private createConfig() {
		return {
			projectName: 'cypress-cli-studio',
			version: '14.3.2',
			browser: this.detectBrowser(),
			platform: this.detectPlatform(),
			arch: this.detectArch(),
			testingType: 'e2e',
			isTextTerminal: false,
			isInteractive: true,
			viewportWidth: 1000,
			viewportHeight: 660,
			defaultCommandTimeout: 4000,
			execTimeout: 60000,
			taskTimeout: 60000,
			pageLoadTimeout: 60000,
			requestTimeout: 5000,
			responseTimeout: 30000,
			retries: { runMode: 0, openMode: 0 },
			waitForAnimations: true,
			animationDistanceThreshold: 5,
			scrollBehavior: 'top',
			numTestsKeptInMemory: 0,
			baseUrl: null,
			experimentalMemoryManagement: false,
			experimentalModifyObstructiveThirdPartyCode: false,
			namespace: '__cypress',
			spec: { relative: 'repl.ts', absolute: '/repl.ts', name: 'repl.ts' },
		};
	}

	private wireShims() {
		// Intercept backend:request events
		this.Cypress.on('backend:request', (eventName: string, ...args: any[]) => {
			const fn = args[args.length - 1];
			if (typeof fn !== 'function') return;

			try {
				let response: any;
				switch (eventName) {
					case 'resolve:url': {
						const [url] = args as [string];
						const resolved = new URL(url, window.location.origin).href;
						response = {
							url: resolved,
							originalUrl: url,
							cookies: [],
							redirects: [],
							contentType: 'text/html',
							filePath: null,
							isOkStatusCode: true,
							isHtml: true,
						};
						break;
					}
					case 'reset:server:state':
						response = {};
						break;
					case 'close:extra:targets':
						response = {};
						break;
					case 'run:privileged': {
						const [{ commandName }] = args as [{ commandName: string }];
						throw new Error(
							`\`cy.${commandName}()\` requires a Node.js server and is not available in browser-only mode.`,
						);
					}
					default:
						throw new Error(
							`Cypress.backend('${eventName}') is not available in browser mode.`,
						);
				}
				fn({ response });
			} catch (err: any) {
				fn({
					error: { message: err.message, name: err.name, stack: err.stack },
				});
			}
		});

		// Intercept automation:request events
		this.Cypress.on(
			'automation:request',
			(eventName: string, ...args: any[]) => {
				const fn = args[args.length - 1];
				if (typeof fn !== 'function') return;

				try {
					let response: any;
					switch (eventName) {
						case 'focus:browser:window':
							window.focus();
							response = {};
							break;
						case 'get:cookies':
							response = [];
							break;
						case 'get:cookie':
							response = null;
							break;
						case 'set:cookie':
							response = args[0];
							break;
						case 'clear:cookie':
						case 'clear:cookies':
							response = [];
							break;
						case 'reset:browser:state':
							response = {};
							break;
						case 'take:screenshot':
							throw new Error('Screenshots are not available in browser mode.');
						default:
							throw new Error(
								`Cypress.automation('${eventName}') is not available in browser mode.`,
							);
					}
					fn({ response });
				} catch (err: any) {
					fn({
						error: { message: err.message, name: err.name, stack: err.stack },
					});
				}
			},
		);
	}
}

// Make available as global
if (typeof window !== 'undefined') {
	(window as any).CypressLite = CypressLite;
}
