import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: [
			'dist/**',
			'node_modules/**',
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['**/*.ts'],
		rules: {
			'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/no-explicit-any': 'warn',
		},
	},
	// Ported Playwright code — relaxed rules to preserve diff-ability with upstream
	{
		files: ['src/injected/**/*.ts'],
		linterOptions: {
			reportUnusedDisableDirectives: 'off',
		},
		plugins: {
			// Stub the notice plugin so eslint-disable notice/notice doesn't error
			notice: {
				rules: {
					notice: { create: () => ({}) },
				},
			},
		},
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/ban-ts-comment': 'off',
			'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_|^e$' }],
			'no-empty': 'off',
			'no-control-regex': 'off',
			'no-case-declarations': 'off',
		},
	},
);
