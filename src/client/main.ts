#!/usr/bin/env node

/**
 * Executable entry point for cypress-cli.
 * This file is the target of the `bin` field in package.json.
 */

import { main } from './cli.js';

main().catch((err: Error) => {
	process.stderr.write(`Fatal: ${err.message}\n`);
	process.exit(1);
});
