/**
 * PreToolUse hook - blocks dangerous bash commands
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
// @ts-expect-error - bash-parser has no types
import parse from 'bash-parser';

import {
	readHookInput,
	EXIT,
	type PreToolInput,
} from '@mcp/core';

import type { ASTNode, RulesConfig } from './types.js';
import { extractCommands } from './parser.js';
import { checkCommand, checkPipeline } from './rules.js';

// Load rules from JSON config
const __dirname = dirname(fileURLToPath(import.meta.url));
const rulesPath = join(__dirname, '..', 'rules.json');
const rules: RulesConfig = JSON.parse(readFileSync(rulesPath, 'utf-8'));

/**
 * Run pre-guard check on a command
 */
export function checkBashCommand(command: string): { blocked: boolean; rule?: { name: string; reason: string } } {
	// Parse command into AST
	let ast: ASTNode;
	try {
		ast = parse(command);
	} catch {
		// If parsing fails, allow (fail open)
		return { blocked: false };
	}

	// Check pipeline patterns first (curl | bash)
	const pipeRule = checkPipeline(ast, rules);
	if (pipeRule) {
		return { blocked: true, rule: { name: pipeRule.name, reason: pipeRule.reason } };
	}

	// Extract and check each command
	const commands = extractCommands(ast);

	for (const cmdInfo of commands) {
		const result = checkCommand(cmdInfo, rules);
		if (result.blocked && result.rule) {
			return { blocked: true, rule: { name: result.rule.name, reason: result.rule.reason } };
		}
	}

	return { blocked: false };
}

/**
 * Main entry point for PreToolUse hook
 */
export function runPreGuard(): void {
	try {
		const data = readHookInput<PreToolInput>();
		const command = data.tool_input?.command;

		if (!command) {
			process.exit(EXIT.ALLOW);
		}

		const result = checkBashCommand(command);

		if (result.blocked && result.rule) {
			console.error('BLOCKED by guard');
			console.error(`  Rule: ${result.rule.name}`);
			console.error(`  Reason: ${result.rule.reason}`);
			console.error(`  Command: ${command}`);
			process.exit(EXIT.BLOCK);
		}

		process.exit(EXIT.ALLOW);
	} catch (error) {
		// Graceful degradation: allow on error
		console.error('guard error:', (error as Error).message);
		process.exit(EXIT.ALLOW);
	}
}
