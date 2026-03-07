import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
	{
		extends: './vitest.config.ts',
		test: {
			name: 'happy-dom',
			environment: 'happy-dom',
			include: [
				'tests/unit/injected/**/*.test.ts',
				'tests/unit/browser/**/*.test.ts',
			],
		},
	},
	{
		extends: './vitest.config.ts',
		test: {
			name: 'node',
			environment: 'node',
			include: [
				'tests/unit/daemon/**/*.test.ts',
				'tests/unit/client/**/*.test.ts',
				'tests/unit/cypress/**/*.test.ts',
				'tests/unit/codegen/**/*.test.ts',
				'tests/unit/protocol/**/*.test.ts',
				'tests/unit/shared/**/*.test.ts',
				'tests/integration/**/*.test.ts',
			],
		},
	},
	{
		extends: './vitest.config.ts',
		test: {
			name: 'e2e',
			environment: 'node',
			include: ['tests/e2e/**/*.test.ts'],
			pool: 'forks',
			poolOptions: {
				forks: {
					singleFork: true,
				},
			},
			fileParallelism: false,
			maxWorkers: 1,
		},
	},
]);
