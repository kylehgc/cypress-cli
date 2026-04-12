// Server shim — no server in browser mode
const $Server = {
	create(_options: any) {
		return {
			connect() {},
			getRemoteState() {
				return {};
			},
		};
	},
};

export default $Server;
