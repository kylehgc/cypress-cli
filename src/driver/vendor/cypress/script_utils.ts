// script_utils shim — no spec scripts to run in browser mode
const $scriptUtils = {
	runScripts(_options: any) {
		return Promise.resolve();
	},
};

export default $scriptUtils;
