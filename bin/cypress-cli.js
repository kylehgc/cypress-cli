#!/usr/bin/env node

/**
 * cypress-cli binary shim.
 *
 * This file is the npm-installed `cypress-cli` command.
 * It simply imports and runs the compiled CLI entry point.
 */

import { run } from '../dist/client/cli.js';

run(process.argv.slice(2)).then((exitCode) => {
	process.exitCode = exitCode;
});
