// Stub type declarations for modules not available in browser-only driver
declare module 'ordinal' {
	export default function ordinal(n: number): string;
}

declare module 'mime' {
	export function getType(path: string): string | null;
}

declare module 'chai/lib/chai/utils/getEnumerableProperties' {
	export default function getEnumerableProperties(obj: object): string[];
}

declare module '@packages/proxy/lib/types' {
	export interface AnnotationError {
		[key: string]: any;
	}
	export interface RequestError {
		[key: string]: any;
	}
	export interface BrowserPreRequest {
		[key: string]: any;
	}
	export interface BrowserResponseReceived {
		[key: string]: any;
	}
}

declare module '@packages/net-stubbing/lib/types' {
	export interface Route {
		[key: string]: any;
	}
	export type BackendStaticResponse = any;
	export interface Interception {
		[key: string]: any;
	}
}

declare module '@cypress/sinon-chai' {
	const sinonChai: any;
	export default sinonChai;
}

declare module 'jquery.scrollto' {}

// Fix for InternalCypress.Cypress references
declare namespace InternalCypress {
	type Cypress = any;
}

// Missing Cypress internal types used by vendored code
declare interface InternalTypeOptions {
	[key: string]: any;
}

declare interface InternalClearOptions {
	[key: string]: any;
}

// Augment Window for vendored Cypress driver code
interface Window {
	$: any;
	Error: ErrorConstructor;
}

// Augment JQuery for scrollTo
interface JQuery {
	scrollTo(...args: any[]): any;
}
