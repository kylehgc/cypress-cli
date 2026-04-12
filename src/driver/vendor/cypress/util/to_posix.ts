export function toPosix(path: string): string {
	return path.replace(/\\/g, '/');
}

export default toPosix;
