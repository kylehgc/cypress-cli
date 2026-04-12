// source_map_utils shim — no source maps in browser mode
const $sourceMapUtils = {
	destroySourceMapConsumers() {},
	getSourceContents() {
		return null;
	},
	getSourcePosition(..._args: any[]) {
		return null;
	},
};

export default $sourceMapUtils;
