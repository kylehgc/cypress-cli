// minimatch shim — basic glob matching for browser
export function minimatch(str: string, pattern: string): boolean {
	const regexStr = pattern
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		.replace(/\*/g, '.*')
		.replace(/\?/g, '.');
	return new RegExp(`^${regexStr}$`).test(str);
}

minimatch.filter = (pattern: string) => (str: string) =>
	minimatch(str, pattern);

export default minimatch;
