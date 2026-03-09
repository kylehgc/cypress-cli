import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Write a snapshot YAML string beneath the configured snapshot directory.
 */
export async function writeSnapshotFile(
	snapshotDir: string,
	snapshot: string,
	filename?: string,
): Promise<string> {
	const baseDir = path.resolve(snapshotDir);
	const name =
		filename ?? `page-${new Date().toISOString().replace(/[:.]/g, '-')}.yml`;

	if (path.isAbsolute(name)) {
		throw new Error(
			`Invalid snapshot filename "${name}": absolute paths are not allowed`,
		);
	}

	const filePath = path.resolve(baseDir, name);
	const relative = path.relative(baseDir, filePath);
	if (relative.startsWith('..') || path.isAbsolute(relative)) {
		throw new Error(
			`Invalid snapshot filename "${name}": path traversal is not allowed`,
		);
	}

	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, snapshot, 'utf-8');
	return path.relative(process.cwd(), filePath);
}
