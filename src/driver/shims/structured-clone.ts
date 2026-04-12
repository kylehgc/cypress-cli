// structuredClone ponyfill shim
export default function structuredClonePonyfill<T>(value: T): T {
	if (typeof globalThis.structuredClone === 'function') {
		return globalThis.structuredClone(value);
	}
	return JSON.parse(JSON.stringify(value));
}
