// @sinonjs/fake-timers shim
const fakeTimers = {
	install(_config?: any) {
		return {
			uninstall() {},
			tick(_ms: number) {},
			reset() {},
		};
	},
	createClock(_now?: any) {
		return {
			tick(_ms: number) {},
			reset() {},
		};
	},
};

export default fakeTimers;
