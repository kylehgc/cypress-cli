// Node.js Buffer shim for browser
export const Buffer = {
	from(data: any, encoding?: string) {
		if (typeof data === 'string') {
			if (encoding === 'base64') {
				return atob(data);
			}
			return data;
		}
		return data;
	},
	isBuffer(_obj: any) {
		return false;
	},
	alloc(_size: number) {
		return new Uint8Array(_size);
	},
};

export default Buffer;
