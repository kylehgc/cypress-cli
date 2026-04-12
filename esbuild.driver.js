import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const driverDir = path.join(__dirname, 'src', 'driver');

await esbuild.build({
	entryPoints: ['src/driver/index.ts'],
	bundle: true,
	format: 'esm',
	target: 'es2022',
	platform: 'browser',
	outfile: 'dist/cypress-driver.js',
	external: [],
	define: {
		'process.env.NODE_ENV': '"production"',
		'process.env.DEBUG': '""',
		'process.platform': '"browser"',
		global: 'globalThis',
	},
	inject: [path.join(driverDir, 'shims', 'process-shim.ts')],
	alias: {
		// @packages/* shims
		'@packages/errors': path.join(driverDir, 'shims', 'errors.ts'),
		'@packages/errors/src/stackUtils': path.join(
			driverDir,
			'shims',
			'errors-stack-utils.ts',
		),
		'@packages/types': path.join(driverDir, 'shims', 'types.ts'),
		'@packages/network/lib/cors': path.join(driverDir, 'shims', 'network.ts'),
		'@packages/network/lib/document-domain-injection': path.join(
			driverDir,
			'shims',
			'network.ts',
		),
		'@packages/server/lib/automation/commands/key_press': path.join(
			driverDir,
			'shims',
			'server.ts',
		),
		'@packages/server/lib/util/cookies': path.join(
			driverDir,
			'shims',
			'server.ts',
		),
		'@packages/telemetry/src/browser': path.join(
			driverDir,
			'shims',
			'telemetry.ts',
		),
		'@packages/config': path.join(driverDir, 'shims', 'config_validate.ts'),

		// Node built-in shims
		path: 'path-browserify',
		events: 'eventemitter2',
		url: 'url-parse',
		buffer: path.join(driverDir, 'shims', 'buffer.ts'),
		fs: path.join(driverDir, 'shims', 'noop.ts'),
		stream: path.join(driverDir, 'shims', 'noop.ts'),
		util: path.join(driverDir, 'shims', 'node-util.ts'),

		// Problematic package shims
		sinon: path.join(driverDir, 'shims', 'sinon.ts'),
		'@sinonjs/fake-timers': path.join(driverDir, 'shims', 'fake-timers.ts'),
		'@cypress/sinon-chai': path.join(driverDir, 'shims', 'sinon-chai.ts'),
		debug: path.join(driverDir, 'shims', 'debug.ts'),
		minimatch: path.join(driverDir, 'shims', 'minimatch.ts'),
		'common-tags': path.join(driverDir, 'shims', 'common-tags.ts'),
		methods: path.join(driverDir, 'shims', 'methods.ts'),
		mime: path.join(driverDir, 'shims', 'noop.ts'),
		md5: path.join(driverDir, 'shims', 'md5.ts'),
		ordinal: path.join(driverDir, 'shims', 'ordinal.ts'),
		'js-cookie': path.join(driverDir, 'shims', 'js-cookie.ts'),
		'error-stack-parser': path.join(
			driverDir,
			'shims',
			'error-stack-parser.ts',
		),
		'@babel/code-frame': path.join(driverDir, 'shims', 'code-frame.ts'),
		'core-js-pure/actual/structured-clone': path.join(
			driverDir,
			'shims',
			'structured-clone.ts',
		),
		'chai/lib/chai/utils/getEnumerableProperties': path.join(
			driverDir,
			'shims',
			'chai-getEnumerableProperties.ts',
		),
	},
	mainFields: ['browser', 'module', 'main'],
	logLevel: 'warning',
	sourcemap: true,
	minify: true,
});

console.log('Driver built: dist/cypress-driver.js');
const { statSync } = await import('fs');
const stat = statSync('dist/cypress-driver.js');
console.log(`Size: ${(stat.size / 1024).toFixed(0)} KB`);
