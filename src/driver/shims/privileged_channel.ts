// Privileged channel shim — no-ops for browser mode
export function setSpecContentSecurityPolicy(
	_specWindow: Window,
): Promise<void> {
	return Promise.resolve();
}

export function getPrivilegedChannel() {
	return {
		send(_msg: string, ..._args: any[]) {},
		on(_msg: string, _handler: (...args: any[]) => void) {},
	};
}

export default { setSpecContentSecurityPolicy, getPrivilegedChannel };
