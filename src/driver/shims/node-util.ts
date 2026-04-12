// Node.js util shim
export function inspect(obj: any, _options?: any): string {
	try {
		return JSON.stringify(obj, null, 2);
	} catch {
		return String(obj);
	}
}

export function format(fmt: string, ...args: any[]): string {
	let i = 0;
	return fmt.replace(/%[sdj%]/g, (match) => {
		if (match === '%%') return '%';
		if (i >= args.length) return match;
		const val = args[i++];
		if (match === '%s') return String(val);
		if (match === '%d') return Number(val).toString();
		if (match === '%j') {
			try {
				return JSON.stringify(val);
			} catch {
				return '[Circular]';
			}
		}
		return match;
	});
}

export function deprecate(fn: Function, _msg: string): Function {
	return fn;
}

export function inherits(ctor: any, superCtor: any) {
	ctor.super_ = superCtor;
	ctor.prototype = Object.create(superCtor.prototype, {
		constructor: {
			value: ctor,
			enumerable: false,
			writable: true,
			configurable: true,
		},
	});
}

export default { inspect, format, deprecate, inherits };
