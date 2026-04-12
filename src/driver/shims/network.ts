// @packages/network shimg
export class DocumentDomainInjection {
	static InjectionBehavior(_config: any) {
		return {
			shouldInjectDocumentDomain(_domain: any) {
				return false;
			},
		};
	}
}

export function cors() {
	return {};
}

export function getSuperDomainOrigin(url: string) {
	try {
		return new URL(url).origin;
	} catch {
		return url;
	}
}

export function getSuperDomain(url: string) {
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}

export default {
	DocumentDomainInjection,
	cors,
	getSuperDomainOrigin,
	getSuperDomain,
};
