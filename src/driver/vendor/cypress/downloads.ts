// Downloads shim — no downloads tracking in browser mode
const $Downloads = {
	create(_Cypress: any) {
		return {
			start() {},
			end() {},
		};
	},
};

export default $Downloads;
