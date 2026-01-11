#!/usr/bin/env node
/**
 * Sherpa CLI - unified entry point
 *
 * Usage:
 *   sherpa init     # Set up repo (husky, lint-staged, gitleaks, claude hooks)
 *   sherpa pre      # PreToolUse hook (blocks dangerous commands)
 *   sherpa post     # PostToolUse hook (offloads large output)
 */

import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import { runInit } from './commands/init.js'
import { runPost } from './commands/post.js'
import { runPre } from './commands/pre.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function getVersion(): string {
	try {
		const pkgPath = join(__dirname, '..', 'package.json')
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
		return pkg.version || '0.0.0'
	} catch {
		return '0.0.0'
	}
}

function showHelp(): void {
	console.log(`
sherpa - MCP hooks and repo setup for safer AI coding

Usage:
  sherpa init     Set up repo (husky, lint-staged, gitleaks, claude hooks)
  sherpa pre      PreToolUse hook (blocks dangerous commands)
  sherpa post     PostToolUse hook (offloads large output)
  sherpa daemon   Start persistent daemon for faster hook responses
  sherpa status   Show LLM provider status and rate limits

Options:
  --help, -h      Show this help message
  --version, -v   Show version

Examples:
  sherpa init              # First-time setup
  sherpa init --force      # Overwrite existing config
  sherpa daemon &          # Start daemon in background
  sherpa status            # Check provider quotas
`)
}

const command = process.argv[2]

try {
	switch (command) {
		case 'init':
			runInit()
			break
		case 'pre':
			runPre()
			break
		case 'post':
			runPost()
			break
		case 'daemon':
			// Dynamic import to avoid loading daemon code unless needed
			import('./daemon.js')
			break
		case 'status':
			// Dynamic import for status command
			import('./commands/status.js').then(m => m.runStatus())
			break
		case '--help':
		case '-h':
		case undefined:
			showHelp()
			break
		case '--version':
		case '-v':
			console.log(getVersion())
			break
		default:
			console.error(`Unknown command: ${ command }`)
			console.error('Run "sherpa --help" for usage')
			process.exit(1)
	}
} catch(error) {
	const message = error instanceof Error ? error.message : String(error)
	console.error(`Error: ${ message }`)
	process.exit(1)
}
