// @packages/telemetry shim
export const telemetry = {
	getSpan(_name: string) {
		return null;
	},
	startSpan(_name: string, _options?: any) {
		return {
			end() {},
			setStatus() {},
			setAttribute() {},
		};
	},
};

export default telemetry;
