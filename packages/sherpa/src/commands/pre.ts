/**
 * sherpa pre - PreToolUse hook that blocks dangerous bash commands
 */

import {
	EXIT,
	type PreToolInput,
	readHookInput
} from '@goobits/sherpa-core'
// @ts-expect-error - bash-parser has no types
import parse from 'bash-parser'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import { extractCommands } from '../parser.js'
import { checkCommand, checkPipeline } from '../rules.js'
import type { ASTNode, RulesConfig } from '../types.js'

// Load rules from JSON config
const __dirname = dirname(fileURLToPath(import.meta.url))
const rulesPath = join(__dirname, '..', '..', 'rules.json')
const rules: RulesConfig = JSON.parse(readFileSync(rulesPath, 'utf-8'))

// Fast-path: commands that are always safe (skip expensive parse)
const SAFE_COMMAND_PREFIXES = [
	'echo ', 'echo\t', 'printf ',
	'ls ', 'ls\t', 'ls\n', 'ls',
	'pwd', 'date', 'whoami', 'id',
	'cat ', 'head ', 'tail ', 'wc ',
	'grep ', 'awk ', 'sed ',
	'cd ', 'cd\t',
	'true', 'false', ':'
]

function isFastPathSafe(command: string): boolean {
	const trimmed = command.trim()
	// Check if command starts with a known-safe prefix
	for (const prefix of SAFE_COMMAND_PREFIXES) {
		if (trimmed === prefix.trim() || trimmed.startsWith(prefix)) {
			// Quick check: no compound commands, pipes, or dangerous chars
			if (
				!trimmed.includes('|') &&
				!trimmed.includes('&&') &&
				!trimmed.includes('||') &&
				!trimmed.includes(';') &&
				!trimmed.includes('$(') &&
				!trimmed.includes('`')
			) {
				return true
			}
		}
	}
	return false
}

/**
 * Run pre-guard check on a command
 */
export function checkBashCommand(command: string): { blocked: boolean; rule?: { name: string; reason: string } } {
	// Fast path: skip parsing for known-safe commands
	if (isFastPathSafe(command)) {
		return { blocked: false }
	}

	// Parse command into AST
	let ast: ASTNode
	try {
		ast = parse(command)
	} catch {
		// If parsing fails, allow (fail open)
		return { blocked: false }
	}

	// Check pipeline patterns first (curl | bash)
	const pipeRule = checkPipeline(ast, rules)
	if (pipeRule) {
		return { blocked: true, rule: { name: pipeRule.name, reason: pipeRule.reason } }
	}

	// Extract and check each command
	const commands = extractCommands(ast)

	for (const cmdInfo of commands) {
		const result = checkCommand(cmdInfo, rules)
		if (result.blocked && result.rule) {
			return { blocked: true, rule: { name: result.rule.name, reason: result.rule.reason } }
		}
	}

	return { blocked: false }
}

/**
 * Main entry point for PreToolUse hook
 */
export function runPre(): void {
	try {
		const data = readHookInput<PreToolInput>()
		const command = data.tool_input?.command

		if (!command) {
			process.exit(EXIT.ALLOW)
		}

		const result = checkBashCommand(command)

		if (result.blocked && result.rule) {
			console.error('BLOCKED by sherpa')
			console.error(`  Rule: ${ result.rule.name }`)
			console.error(`  Reason: ${ result.rule.reason }`)
			console.error(`  Command: ${ command }`)
			process.exit(EXIT.BLOCK)
		}

		process.exit(EXIT.ALLOW)
	} catch(error) {
		// Graceful degradation: allow on error
		console.error('sherpa pre error:', (error as Error).message)
		process.exit(EXIT.ALLOW)
	}
}
