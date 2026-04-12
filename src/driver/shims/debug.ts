// debug shim — returns a no-op logger
function debug(_namespace: string) {
	const fn = function (..._args: any[]) {} as any;
	fn.enabled = false;
	fn.namespace = _namespace;
	fn.extend = (_suffix: string) => debug(`${_namespace}:${_suffix}`);
	fn.log = () => {};
	return fn;
}

debug.enable = (_ns: string) => {};
debug.disable = () => '';
debug.enabled = (_ns: string) => false;
debug.log = () => {};

export default debug;
export { debug };
