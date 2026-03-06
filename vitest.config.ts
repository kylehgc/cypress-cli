import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['tests/**/*.test.ts'],
		exclude: [
			'**/node_modules/**',
			'**/dist/**',
			'**/.{idea,git,cache,output,temp}/**',
			'**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,tsup,build,eslint,prettier}.config.*',
		],
		passWithNoTests: true,
		environment: 'happy-dom',
		environmentMatchGlobs: [
			['tests/unit/injected/**', 'happy-dom'],
			['tests/unit/daemon/**', 'node'],
			['tests/unit/client/**', 'node'],
			['tests/unit/cypress/**', 'node'],
			['tests/unit/codegen/**', 'node'],
			['tests/unit/protocol/**', 'node'],
			['tests/unit/shared/**', 'node'],
			['tests/integration/**', 'node'],
			['tests/e2e/**', 'node'],
		],
		testTimeout: 10_000,
		hookTimeout: 10_000,
		// E2E tests launch real Cypress + Electron instances and must not run
		// in parallel. Use `sequence.sequentialFiles` patterns to serialize them.
		sequence: {
			sequentialFiles: ['tests/e2e/**'],
		},
		poolOptions: {
			threads: {
				// Run E2E tests in a single thread to avoid resource conflicts
				maxThreads: 1,
				minThreads: 1,
			},
		},
	},
});
