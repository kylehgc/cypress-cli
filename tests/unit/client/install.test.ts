import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { installSkills } from '../../../src/client/install.js';

async function makeTempDir(prefix: string): Promise<string> {
	return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe('installSkills', () => {
	it('copies the bundled skill into .github/skills/cypress-cli', async () => {
		const cwd = await makeTempDir('cypress-cli-install-project-');
		const sourceDir = await makeTempDir('cypress-cli-install-source-');

		await fs.writeFile(path.join(sourceDir, 'SKILL.md'), '# Skill\n', 'utf-8');
		await fs.mkdir(path.join(sourceDir, 'references'), { recursive: true });
		await fs.writeFile(
			path.join(sourceDir, 'references', 'test-generation.md'),
			'# Test generation\n',
			'utf-8',
		);

		const result = await installSkills({ cwd, sourceDir });
		expect(result.installedPath).toBe('.github/skills/cypress-cli');

		await expect(
			fs.readFile(
				path.join(cwd, '.github', 'skills', 'cypress-cli', 'SKILL.md'),
				'utf-8',
			),
		).resolves.toContain('# Skill');
		await expect(
			fs.readFile(
				path.join(
					cwd,
					'.github',
					'skills',
					'cypress-cli',
					'references',
					'test-generation.md',
				),
				'utf-8',
			),
		).resolves.toContain('# Test generation');
	});

	it('replaces an existing installed skill directory', async () => {
		const cwd = await makeTempDir('cypress-cli-install-existing-project-');
		const sourceDir = await makeTempDir('cypress-cli-install-existing-source-');
		const installedDir = path.join(cwd, '.github', 'skills', 'cypress-cli');

		await fs.mkdir(installedDir, { recursive: true });
		await fs.writeFile(path.join(installedDir, 'stale.txt'), 'stale', 'utf-8');
		await fs.writeFile(path.join(sourceDir, 'SKILL.md'), '# Fresh skill\n', 'utf-8');

		await installSkills({ cwd, sourceDir });

		await expect(fs.access(path.join(installedDir, 'stale.txt'))).rejects.toThrow();
		await expect(fs.readFile(path.join(installedDir, 'SKILL.md'), 'utf-8')).resolves
			.toContain('# Fresh skill');
	});

	it('throws a helpful error when the bundled skill directory is missing', async () => {
		const cwd = await makeTempDir('cypress-cli-install-missing-project-');
		const missingSourceDir = path.join(cwd, 'does-not-exist');

		await expect(installSkills({ cwd, sourceDir: missingSourceDir })).rejects.toThrow(
			'Bundled skills directory not found',
		);
	});
});
