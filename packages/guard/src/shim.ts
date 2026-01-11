#!/usr/bin/env node
/**
 * Guard CLI shim - entry point for hooks
 *
 * Usage:
 *   guard-pre   (or: node shim.js --pre)
 *   guard-post  (or: node shim.js --post)
 */

import { basename } from 'path';
import { runPreGuard } from './pre.js';
import { runPostGuard } from './post.js';

// Determine mode from argv or executable name
const execName = basename(process.argv[1] || '');
const args = process.argv.slice(2);

let mode: 'pre' | 'post';

if (args.includes('--pre') || execName === 'guard-pre') {
	mode = 'pre';
} else if (args.includes('--post') || execName === 'guard-post') {
	mode = 'post';
} else {
	console.error('Usage: guard-pre | guard-post | node shim.js --pre | --post');
	process.exit(1);
}

// Run the appropriate guard
if (mode === 'pre') {
	runPreGuard();
} else {
	runPostGuard();
}
