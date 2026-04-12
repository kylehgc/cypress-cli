declare namespace Cypress {
	type Nullable<T> = T | null;
	type IsBrowserMatcher = any;
	type EnqueuedCommandAttributes = any;
	type ActiveSessions = Record<string, any>;
	type Browser = Record<string, any>;
	type BrowserFamily = string;
	type TestingType = string;
	type ResolvedTestConfigOverride = Record<string, any>;
	type LogConfig = Record<string, any>;
	type InternalLogConfig = Record<string, any> & { id?: string };
	type ObjectLike = Record<string, any>;
	type Log = any;
	type Cypress = any;
	type cy = any;

	namespace LogGroup {
		type Config = Record<string, any>;
		type ApiCallback = (...args: any[]) => any;
	}
}

declare namespace Mocha {
	type Suite = any;
	type Test = any;
	type Runnable = any;
}

declare namespace InternalCypress {
	type PrivilegedCommand = any;
}

declare type AliasedRequest = any;
declare type CypressRunnable = any;
declare type SpecWindow = Window & typeof globalThis;

declare const Cypress: any;
declare const cy: any;
