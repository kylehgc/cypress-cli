// @packages/types shim — provides minimal type stubs
export interface CypressConfig {
	[key: string]: any;
}

export interface CachedTestState {
	[key: string]: any;
}

export type PlatformName = 'darwin' | 'linux' | 'win32';

export interface FoundBrowser {
	name: string;
	displayName: string;
	version: string;
	majorVersion: string | number;
	isHeadless: boolean;
	isHeaded: boolean;
	family: string;
}

export interface AutomationMiddleware {
	[key: string]: any;
}

export interface NetworkProxy {
	[key: string]: any;
}

export interface TestingType {
	[key: string]: any;
}

export type KeyPressSupportedKeys = string;

export interface RunState {
	[key: string]: any;
}

export type AutomationCommands = string;

// Export everything else as any
export default {};
