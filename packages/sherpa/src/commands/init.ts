/**
 * sherpa init - Set up repo with husky, lint-staged, gitleaks, and claude hooks
 *
 * Usage: sherpa init [--force]
 */

import { execSync } from 'child_process'
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface HookEntry {
	matcher: string;
	hooks: Array<{ type: string; command: string }>;
}

interface McpServer {
	type: 'stdio';
	command: string;
	args: string[];
	env?: Record<string, string>;
}

interface McpJson {
	mcpServers: Record<string, McpServer>;
}

interface ClaudeSettings {
	hooks?: {
		PreToolUse?: HookEntry[];
		PostToolUse?: HookEntry[];
	};
	[key: string]: unknown;
}

const CLAUDE_HOOK_CONFIG = {
	PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'sherpa pre' }] }],
	PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'sherpa post' }] }]
}

const GUARD_CONFIG = {
	maxTokens: 2000,
	previewTokens: 500,
	scratchDir: '.claude/scratch',
	maxAgeMinutes: 60,
	maxScratchSizeMB: 50
}

const LINT_STAGED_CONFIG = {
	'*.{js,jsx,ts,tsx}': ['eslint --fix'],
	'*.{json,md,yml,yaml}': ['prettier --write']
}

const HUSKY_PRE_COMMIT = `#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx lint-staged
gitleaks protect --staged --verbose
`

/**
 * Get absolute path to node binary
 */
function getNodePath(): string {
	try {
		return execSync('which node', { encoding: 'utf-8' }).trim()
	} catch {
		return 'node' // fallback
	}
}

/**
 * Get absolute path to reviewer dist
 */
function getReviewerPath(): string {
	// __dirname is packages/sherpa/dist/commands in compiled code
	// Reviewer is at packages/reviewer/dist/index.js
	const reviewerPath = resolve(__dirname, '../../../reviewer/dist/index.js')
	if (existsSync(reviewerPath)) {
		return reviewerPath
	}
	// Fallback: try to find via node_modules or global
	return reviewerPath
}

export function runInit(): void {
	const isInitCommand = process.argv[2] === 'init'
	const initArgs = isInitCommand ? process.argv.slice(3) : []
	const force = initArgs.includes('--force')
	const cwd = process.cwd()

	console.log('Setting up sherpa...\n')

	// 1. Create .claude directory and hooks config
	setupClaudeHooks(cwd, force)

	// 2. Set up MCP server in .mcp.json
	setupMcpConfig(cwd, force)

	// 3. Set up husky
	setupHusky(cwd, force)

	// 4. Set up lint-staged
	setupLintStaged(cwd, force)

	// 5. Check for gitleaks
	checkGitleaks()

	// Print success
	console.log(`\n${'='.repeat(50)}`)
	console.log('Sherpa setup complete!\n')
	console.log('What was configured:')
	console.log('  [x] .claude/settings.local.json - Hooks')
	console.log('  [x] .claude/guard.json - Guard config')
	console.log('  [x] .mcp.json - MCP servers')
	console.log('  [x] .husky/pre-commit - Git pre-commit hook')
	console.log('  [x] .lintstagedrc.json - Lint staged files')
	console.log('')
	console.log('Pre-commit will run:')
	console.log('  1. lint-staged (lint/format changed files)')
	console.log('  2. gitleaks (scan for secrets)')
	console.log('')
	console.log('Claude Code:')
	console.log('  - sherpa pre: Block dangerous bash commands')
	console.log('  - sherpa post: Offload large outputs')
	console.log('  - cerebras-reviewer: AI code review (MCP)')
	console.log('')
	console.log('IMPORTANT: Restart Claude Code to load the MCP server.')
	console.log('='.repeat(50))
}

function setupClaudeHooks(cwd: string, force: boolean): void {
	const claudeDir = join(cwd, '.claude')
	const configPath = join(claudeDir, 'guard.json')
	const settingsPath = join(claudeDir, 'settings.local.json')

	// Create .claude directory
	if (!existsSync(claudeDir)) {
		mkdirSync(claudeDir, { recursive: true })
		console.log('Created .claude/ directory')
	}

	// Create guard.json
	if (!existsSync(configPath) || force) {
		writeFileSync(configPath, `${JSON.stringify(GUARD_CONFIG, null, 2)}\n`)
		console.log('Created .claude/guard.json')
	} else {
		console.log('.claude/guard.json already exists (use --force to overwrite)')
	}

	// Update settings.local.json with hooks only (not MCP)
	let settings: ClaudeSettings = {}
	if (existsSync(settingsPath)) {
		try {
			settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
		} catch {
			console.warn('Warning: Could not parse existing settings.local.json')
		}
	}

	// Merge hook config
	settings.hooks = settings.hooks || {}
	let hooksUpdated = false

	for (const [hookType, hooks] of Object.entries(CLAUDE_HOOK_CONFIG)) {
		const existing = settings.hooks[hookType as keyof typeof CLAUDE_HOOK_CONFIG] || []
		const hasSherpa = existing.some(
			h => h.hooks?.some((hook: { command?: string }) => hook.command?.startsWith('sherpa '))
		)

		if (!hasSherpa) {
			settings.hooks[hookType as keyof typeof CLAUDE_HOOK_CONFIG] = [...existing, ...hooks]
			hooksUpdated = true
		}
	}

	if (hooksUpdated) {
		writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`)
		console.log('Updated .claude/settings.local.json with hooks')
	} else {
		console.log('Claude hooks already configured')
	}
}

function setupMcpConfig(cwd: string, force: boolean): void {
	const mcpPath = join(cwd, '.mcp.json')
	const nodePath = getNodePath()
	const reviewerPath = getReviewerPath()

	const mcpConfig: McpServer = {
		type: 'stdio',
		command: nodePath,
		args: [reviewerPath],
		env: {}
	}

	// Try using claude CLI first (most reliable)
	try {
		// Check if server already exists
		const listOutput = execSync('claude mcp list 2>&1', { encoding: 'utf-8', cwd })
		if (listOutput.includes('cerebras-reviewer') && !force) {
			console.log('MCP server cerebras-reviewer already configured')
			return
		}

		// Remove existing and add fresh
		if (force || listOutput.includes('cerebras-reviewer')) {
			execSync('claude mcp remove cerebras-reviewer -s project 2>/dev/null || true', { cwd, stdio: 'pipe' })
		}

		execSync(`claude mcp add cerebras-reviewer -s project ${nodePath} ${reviewerPath}`, {
			cwd,
			stdio: 'pipe'
		})
		console.log('Added MCP server via claude CLI')
		return
	} catch {
		// Claude CLI not available, fall back to manual config
	}

	// Manual .mcp.json creation
	let mcpJson: McpJson = { mcpServers: {} }
	if (existsSync(mcpPath)) {
		try {
			mcpJson = JSON.parse(readFileSync(mcpPath, 'utf-8'))
		} catch {
			console.warn('Warning: Could not parse existing .mcp.json')
		}
	}

	if (!mcpJson.mcpServers['cerebras-reviewer'] || force) {
		mcpJson.mcpServers['cerebras-reviewer'] = mcpConfig
		writeFileSync(mcpPath, `${JSON.stringify(mcpJson, null, 2)}\n`)
		console.log('Created .mcp.json with cerebras-reviewer')
	} else {
		console.log('.mcp.json already has cerebras-reviewer')
	}
}

function setupHusky(cwd: string, force: boolean): void {
	const huskyDir = join(cwd, '.husky')
	const preCommitPath = join(huskyDir, 'pre-commit')
	const pkgPath = join(cwd, 'package.json')

	if (!existsSync(pkgPath)) {
		console.log('No package.json found - skipping husky setup')
		return
	}

	try {
		JSON.parse(readFileSync(pkgPath, 'utf-8'))
	} catch {
		console.warn('Warning: Could not parse package.json')
		return
	}

	const hasHusky = existsSync(huskyDir)

	if (!hasHusky) {
		try {
			console.log('Initializing husky...')
			execSync('npx husky init', { cwd, stdio: 'pipe' })
			console.log('Initialized husky')
		} catch {
			console.warn('Could not initialize husky automatically')
			console.warn('Run: npx husky init')
			return
		}
	}

	if (!existsSync(preCommitPath) || force) {
		writeFileSync(preCommitPath, HUSKY_PRE_COMMIT)
		chmodSync(preCommitPath, '755')
		console.log('Created .husky/pre-commit')
	} else {
		const existing = readFileSync(preCommitPath, 'utf-8')
		if (!existing.includes('gitleaks')) {
			appendFileSync(preCommitPath, '\ngitleaks protect --staged --verbose\n')
			console.log('Added gitleaks to existing pre-commit hook')
		} else {
			console.log('.husky/pre-commit already configured')
		}
	}
}

function setupLintStaged(cwd: string, force: boolean): void {
	const configPath = join(cwd, '.lintstagedrc.json')

	if (!existsSync(configPath) || force) {
		writeFileSync(configPath, `${JSON.stringify(LINT_STAGED_CONFIG, null, 2)}\n`)
		console.log('Created .lintstagedrc.json')
	} else {
		console.log('.lintstagedrc.json already exists')
	}
}

function checkGitleaks(): void {
	try {
		const checkCmd = process.platform === 'win32' ? 'where gitleaks' : 'command -v gitleaks'
		execSync(checkCmd, { stdio: 'pipe' })
		console.log('gitleaks found')
	} catch {
		console.log('')
		console.log('NOTE: gitleaks not found. Install it:')
		console.log('  brew install gitleaks       # macOS')
		console.log('  apt install gitleaks        # Debian/Ubuntu')
		console.log('  choco install gitleaks      # Windows')
		console.log('  https://github.com/gitleaks/gitleaks#installing')
	}
}
