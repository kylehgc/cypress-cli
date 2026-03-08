import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Result of installing bundled skills into the current project.
 */
export interface InstallSkillsResult {
	/** Relative path to the installed skill directory. */
	installedPath: string;
}

/**
 * Options for installing bundled skills.
 */
export interface InstallSkillsOptions {
	/** Project directory to install into. Defaults to the current working directory. */
	cwd?: string;
	/** Override the source skill directory. Intended for tests. */
	sourceDir?: string;
}

/**
 * Copy the packaged cypress-cli skill into the current project.
 *
 * The skill is installed under `.github/skills/cypress-cli`, which is one of
 * the standard repository locations agent runtimes scan for project skills.
 *
 * @param options - Install options
 * @returns Relative path to the installed skill directory
 */
export async function installSkills(
	options: InstallSkillsOptions = {},
): Promise<InstallSkillsResult> {
	const cwd = path.resolve(options.cwd ?? process.cwd());
	const sourceDir =
		options.sourceDir ??
		fileURLToPath(new URL('../../skills/cypress-cli', import.meta.url));
	const targetDir = path.join(cwd, '.github', 'skills', 'cypress-cli');

	try {
		const stat = await fs.stat(sourceDir);
		if (!stat.isDirectory()) {
			throw new Error(`Bundled skills path is not a directory: ${sourceDir}`);
		}
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new Error(
				`Bundled skills directory not found at ${sourceDir}. Reinstall cypress-cli and try again.`,
			);
		}
		throw err;
	}

	await fs.mkdir(path.dirname(targetDir), { recursive: true });
	await fs.rm(targetDir, { recursive: true, force: true });
	await fs.cp(sourceDir, targetDir, { recursive: true });

	return {
		installedPath: path.relative(cwd, targetDir),
	};
}
