export default function toPosix(path: string): string {
	return path.replace(/\\/g, '/');
}
