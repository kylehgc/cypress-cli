import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		exclude: [
			'**/node_modules/**',
			'**/dist/**',
			'**/.{idea,git,cache,output,temp}/**',
			'**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,tsup,build,eslint,prettier}.config.*',
		],
		passWithNoTests: true,
		testTimeout: 10_000,
		hookTimeout: 10_000,
	},
});
