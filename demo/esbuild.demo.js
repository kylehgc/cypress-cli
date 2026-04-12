import { build } from 'esbuild';

await build({
	entryPoints: ['demo/src/main.ts'],
	bundle: true,
	format: 'esm',
	outfile: 'demo/dist/demo.js',
	platform: 'browser',
	target: 'es2022',
	minify: false,
	sourcemap: true,
});

console.log('Built browser demo bundle');