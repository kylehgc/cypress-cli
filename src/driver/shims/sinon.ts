// sinon shim — minimal stubs for browser mode
const stub = () => {
	const fn = function (..._args: any[]) {
		return undefined;
	} as any;
	fn.returns = (val: any) => {
		fn._returnValue = val;
		return fn;
	};
	fn.callsFake = (fakeFn: Function) => {
		fn._fake = fakeFn;
		return fn;
	};
	fn.withArgs = () => fn;
	fn.restore = () => {};
	fn.reset = () => {};
	return fn;
};

const spy = (_target?: any, _method?: string) => {
	const fn = function (..._args: any[]) {
		return undefined;
	} as any;
	fn.restore = () => {};
	fn.reset = () => {};
	fn.calledWith = () => false;
	fn.callCount = 0;
	return fn;
};

const match = { any: true } as any;
match.string = true;
match.number = true;

const sinon = {
	stub,
	spy,
	match,
	restore() {},
	reset() {},
	createSandbox() {
		return sinon;
	},
	useFakeTimers() {
		return { restore() {} };
	},
};

export default sinon;
