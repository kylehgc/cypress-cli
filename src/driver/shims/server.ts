// @packages/server shim — stubs for server-side dependencies
export const keyPress = {
	getSimulatedDefaultForKey() {
		return undefined;
	},
};

export function isSupportedKey(_key: string) {
	return true;
}

export class CookieJar {
	static parse(_cookieString: string) {
		return [];
	}

	getCookies() {
		return [];
	}
	setCookie(_cookie: any, _url?: string) {
		return undefined;
	}
	removeCookie(_cookie: any) {
		return undefined;
	}
	removeAllCookies() {
		return undefined;
	}
}

export const cookies = {
	automationCookieToToughCookie(_cookie: any) {
		return _cookie;
	},
	toughCookieToAutomationCookie(_cookie: any) {
		return _cookie;
	},
};

export default { keyPress, cookies, isSupportedKey, CookieJar };
