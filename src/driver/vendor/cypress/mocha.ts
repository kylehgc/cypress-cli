// Mocha shim — minimal stub for browser mode
const $Mocha = {
	create(_specWindow: any, _Cypress: any, _config: any) {
		return {
			getRunner() {
				return {
					suite: { title: '', root: true, tests: [], suites: [] },
					on() {},
					once() {},
					off() {},
					run(fn?: Function) {
						if (fn) fn(0);
					},
				};
			},
			getRootSuite() {
				return { title: '', root: true, tests: [], suites: [] };
			},
		};
	},
};

export default $Mocha;
