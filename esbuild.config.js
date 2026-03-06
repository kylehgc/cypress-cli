import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

// Build the injected IIFE bundle
await build({
	entryPoints: ['src/injected/index.ts'],
	bundle: true,
	format: 'iife',
	globalName: '__cypressCliAriaSnapshot',
	outfile: 'dist/injected.iife.js',
	platform: 'browser',
	target: 'es2022',
	minify: false,
	sourcemap: false,
	write: true,
});

// Also generate a string constant module that embeds the IIFE
const iifeContent = await readFile('dist/injected.iife.js', 'utf-8');

await writeFile(
	'dist/injected.string.js',
	`export const INJECTED_IIFE = ${JSON.stringify(iifeContent)};\n`,
);

console.log('Built injected IIFE bundle');

// Build the Cypress driver spec bundle.
// The driver spec and its imports (support.ts, browser utils) use Cypress
// globals (cy, Cypress, describe, it) and .js extension imports that
// Cypress's default webpack preprocessor cannot resolve. Bundling into a
// single JS file avoids these issues.
await mkdir('dist/cypress', { recursive: true });
await build({
	entryPoints: ['src/cypress/driverSpec.ts'],
	bundle: true,
	format: 'iife',
	outfile: 'dist/cypress/driverSpec.js',
	platform: 'browser',
	target: 'es2022',
	minify: false,
	sourcemap: false,
	write: true,
	// @cypress/unique-selector is used in browser context and must be bundled
	external: [],
});

console.log('Built driver spec bundle');
