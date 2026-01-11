/**
 * Rule matching engine for guard
 */

import type { ASTNode, CommandInfo, CheckResult, Rule, RulesConfig } from './types.js';
import { normalizePath, isPathWithinAllowed } from './parser.js';

// Cache compiled RegExp patterns to avoid recompilation on every check
const regexCache = new Map<string, RegExp>();

function getRegex(pattern: string): RegExp {
	let regex = regexCache.get(pattern);
	if (!regex) {
		regex = getRegex(pattern);
		regexCache.set(pattern, regex);
	}
	return regex;
}

/**
 * Check if command matches a block rule
 */
export function matchesBlockRule(cmdInfo: CommandInfo, rule: Rule): boolean {
	// Check command name
	if (rule.cmd) {
		const cmds = Array.isArray(rule.cmd) ? rule.cmd : [rule.cmd];
		if (!cmds.includes(cmdInfo.cmd)) return false;
	}

	// Check subcommand (for git, etc.)
	if (rule.subcommand && cmdInfo.subcommand !== rule.subcommand) {
		return false;
	}

	// Check flags
	if (rule.flags) {
		const ruleFlags = Array.isArray(rule.flags) ? rule.flags : [rule.flags];
		const mode = rule.flagMode || 'all';

		if (mode === 'any') {
			const hasAnyFlag = ruleFlags.some((f) => cmdInfo.flags.includes(f));
			if (!hasAnyFlag) return false;
		} else {
			const hasAllFlags = ruleFlags.every((f) => cmdInfo.flags.includes(f));
			if (!hasAllFlags) return false;
		}
	}

	// Check path patterns (using normalized paths to catch traversal)
	if (rule.pathPatterns) {
		const patterns = Array.isArray(rule.pathPatterns)
			? rule.pathPatterns
			: [rule.pathPatterns];
		const pathsToCheck =
			cmdInfo.paths.length > 0 ? cmdInfo.paths : cmdInfo.args;
		if (pathsToCheck.length === 0) return false;

		const matchesPath = pathsToCheck.some((p) => {
			const pathInfo = normalizePath(p);
			// Check both original AND normalized path for block rules
			return patterns.some((pattern) => {
				const regex = getRegex(pattern);
				return regex.test(pathInfo.original) || regex.test(pathInfo.normalized);
			});
		});
		if (!matchesPath) return false;
	}

	// Check arg patterns
	if (rule.argPatterns) {
		const patterns = Array.isArray(rule.argPatterns)
			? rule.argPatterns
			: [rule.argPatterns];
		const rawStr = cmdInfo.raw.join(' ');
		const matchesArg = patterns.some((pattern) =>
			getRegex(pattern).test(rawStr)
		);
		if (!matchesArg) return false;
	}

	return true;
}

/**
 * Check if command matches an allow rule
 */
export function matchesAllowRule(cmdInfo: CommandInfo, rule: Rule): boolean {
	if (rule.cmd) {
		const cmds = Array.isArray(rule.cmd) ? rule.cmd : [rule.cmd];
		if (!cmds.includes(cmdInfo.cmd)) return false;
	}

	if (rule.pathPatterns) {
		const patterns = Array.isArray(rule.pathPatterns)
			? rule.pathPatterns
			: [rule.pathPatterns];
		const pathsToCheck =
			cmdInfo.paths.length > 0 ? cmdInfo.paths : cmdInfo.args;
		if (pathsToCheck.length === 0) return false;

		const matchesPath = pathsToCheck.some((p) => {
			const pathInfo = normalizePath(p);
			return patterns.some((pattern) => isPathWithinAllowed(pathInfo, pattern));
		});

		if (!matchesPath) return false;
	}

	return true;
}

/**
 * Check pipeline for dangerous pipe patterns (curl | bash)
 */
export function checkPipeline(ast: ASTNode, rules: RulesConfig): Rule | null {
	if (!ast || ast.type !== 'Script') return null;

	for (const cmd of ast.commands || []) {
		if (cmd.type !== 'Pipeline') continue;

		const pipeCommands = (cmd.commands || [])
			.map((c) => c.name?.text)
			.filter((t): t is string => Boolean(t));

		for (const rule of rules.block || []) {
			if (!rule.pipeTo) continue;

			const cmds = Array.isArray(rule.cmd) ? rule.cmd : [rule.cmd];
			const pipes = Array.isArray(rule.pipeTo) ? rule.pipeTo : [rule.pipeTo];

			// Find if source command exists in pipeline
			for (let i = 0; i < pipeCommands.length; i++) {
				if (cmds.includes(pipeCommands[i])) {
					// Check if ANY subsequent command is a dangerous target
					for (let j = i + 1; j < pipeCommands.length; j++) {
						if (pipes.includes(pipeCommands[j])) {
							return rule;
						}
					}
				}
			}
		}
	}

	return null;
}

/**
 * Check a command against all rules
 */
export function checkCommand(
	cmdInfo: CommandInfo,
	rules: RulesConfig
): CheckResult {
	// First check allow rules
	for (const rule of rules.allow || []) {
		if (matchesAllowRule(cmdInfo, rule)) {
			return { blocked: false, reason: `Allowed: ${rule.name}` };
		}
	}

	// Then check block rules
	for (const rule of rules.block || []) {
		if (rule.pipeTo) continue; // Handled separately
		if (matchesBlockRule(cmdInfo, rule)) {
			return { blocked: true, rule };
		}
	}

	return { blocked: false };
}
