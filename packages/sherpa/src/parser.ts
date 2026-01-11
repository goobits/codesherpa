/**
 * AST parsing utilities for bash commands
 */

import { homedir } from 'os'

import type { ASTNode, CommandInfo, PathInfo } from './types.js'

// Cache compiled RegExp patterns
const regexCache = new Map<string, RegExp>()

function getRegex(pattern: string): RegExp {
	let regex = regexCache.get(pattern)
	if (!regex) {
		regex = new RegExp(pattern)
		regexCache.set(pattern, regex)
	}
	return regex
}

/**
 * Normalize a path to prevent traversal attacks
 */
export function normalizePath(inputPath: string): PathInfo {
	if (!inputPath) {
		return {
			original: inputPath,
			normalized: inputPath,
			hasTraversal: false,
			isAbsolute: false
		}
	}

	const original = inputPath

	// Handle home directory
	let normalized = inputPath.replace(/^~/, homedir())

	// Split into segments and resolve
	const segments = normalized.split('/')
	const resolved: string[] = []

	for (const seg of segments) {
		if (seg === '..') {
			resolved.pop()
		} else if (seg !== '.' && seg !== '') {
			resolved.push(seg)
		}
	}

	normalized = `/${  resolved.join('/') }`

	return {
		original,
		normalized,
		hasTraversal: original.includes('..'),
		isAbsolute: original.startsWith('/') || original.startsWith('~')
	}
}

/**
 * Check if a normalized path matches an allowed pattern
 */
export function isPathWithinAllowed(
	pathInfo: PathInfo,
	allowedPattern: string
): boolean {
	const regex = getRegex(allowedPattern)

	// If there's traversal, check the NORMALIZED path, not original
	if (pathInfo.hasTraversal) {
		return regex.test(pathInfo.normalized)
	}

	return regex.test(pathInfo.original)
}

/**
 * Extract all commands from AST (handles pipelines, lists, etc.)
 */
export function extractCommands(node: ASTNode | null): CommandInfo[] {
	if (!node) {return []}

	const commands: CommandInfo[] = []

	switch (node.type) {
		case 'Script':
		case 'Pipeline':
			for (const cmd of node.commands || []) {
				commands.push(...extractCommands(cmd))
			}
			break

		case 'LogicalExpression':
			if (node.left) {commands.push(...extractCommands(node.left))}
			if (node.right) {commands.push(...extractCommands(node.right))}
			break

		case 'Command': {
			const parsed = parseCommand(node)
			if (parsed) {commands.push(parsed)}
			break
		}

		case 'Subshell':
		case 'CompoundList':
			for (const cmd of node.list || []) {
				commands.push(...extractCommands(cmd))
			}
			break
	}

	return commands
}

/**
 * Parse a Command node into structured info
 */
export function parseCommand(node: ASTNode): CommandInfo | null {
	if (!node.name?.text) {return null}

	const cmdName = node.name.text

	const info: CommandInfo = {
		cmd: cmdName,
		args: [],
		flags: [],
		paths: [],
		raw: []
	}

	// Parse suffix (arguments and flags)
	for (const part of node.suffix || []) {
		const text = part.text
		if (!text) {continue}

		info.raw.push(text)

		if (text.startsWith('--')) {
			// Long flag: --force, --recursive
			const flag = text.slice(2).split('=')[0]
			info.flags.push(flag)
		} else if (
			text.startsWith('-') &&
			text.length > 1 &&
			!/^-[\d.]+$/.test(text)
		) {
			// Short flags: -rf, -f, -r (but not negative numbers like -1)
			const flags = text.slice(1)
			for (const f of flags) {
				info.flags.push(f)
			}
		} else {
			// Regular argument (could be path)
			info.args.push(text)
			if (/^[/~$.]/.test(text)) {
				info.paths.push(text)
			}
		}
	}

	// Handle git subcommands
	if (cmdName === 'git' && info.args.length > 0) {
		info.subcommand = info.args[0]
		info.subArgs = info.args.slice(1)
	}

	return info
}
