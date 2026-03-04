import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

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
