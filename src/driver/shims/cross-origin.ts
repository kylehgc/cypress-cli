// Cross-origin communicator shim — no-ops for browser mode
export class PrimaryOriginCommunicator {
	on(_event: string, _handler: (...args: any[]) => void) {
		return this;
	}
	once(_event: string, _handler: (...args: any[]) => void) {
		return this;
	}
	emit(_event: string, ..._args: any[]) {
		return this;
	}
	off(_event: string, _handler?: (...args: any[]) => void) {
		return this;
	}
	toAllSpecBridges(_event: string, ..._args: any[]) {}
	toSpecBridge(_origin: string, _event: string, ..._args: any[]) {}
}

export class SpecBridgeCommunicator {
	on(_event: string, _handler: (...args: any[]) => void) {
		return this;
	}
	once(_event: string, _handler: (...args: any[]) => void) {
		return this;
	}
	emit(_event: string, ..._args: any[]) {
		return this;
	}
	off(_event: string, _handler?: (...args: any[]) => void) {
		return this;
	}
	toPrimary(_event: string, ..._args: any[]) {}
}
