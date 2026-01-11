#!/usr/bin/env node
/**
 * Sherpa CLI - unified entry point
 *
 * Usage:
 *   sherpa init     # Set up repo (husky, lint-staged, gitleaks, claude hooks)
 *   sherpa pre      # PreToolUse hook (blocks dangerous commands)
 *   sherpa post     # PostToolUse hook (offloads large output)
 */

import { runInit } from './commands/init.js';
import { runPre } from './commands/pre.js';
import { runPost } from './commands/post.js';

const command = process.argv[2];

switch (command) {
	case 'init':
		runInit();
		break;
	case 'pre':
		runPre();
		break;
	case 'post':
		runPost();
		break;
	case '--help':
	case '-h':
	case undefined:
		console.log(`
sherpa - MCP hooks and repo setup for safer AI coding

Usage:
  sherpa init     Set up repo (husky, lint-staged, gitleaks, claude hooks)
  sherpa pre      PreToolUse hook (blocks dangerous commands)
  sherpa post     PostToolUse hook (offloads large output)

Options:
  --help, -h      Show this help message
  --version, -v   Show version

Examples:
  sherpa init              # First-time setup
  sherpa init --force      # Overwrite existing config
`);
		break;
	case '--version':
	case '-v':
		console.log('1.0.0');
		break;
	default:
		console.error(`Unknown command: ${command}`);
		console.error('Run "sherpa --help" for usage');
		process.exit(1);
}
