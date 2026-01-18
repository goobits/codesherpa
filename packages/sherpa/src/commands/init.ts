/**
 * sherpa init - Set up repo with husky, lint-staged, gitleaks, and MCP servers
 *
 * Usage: sherpa init [--force]
 *
 * Supports: Claude Code, OpenAI Codex CLI, Google Gemini CLI
 */

import { execSync } from 'child_process'
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface HookEntry {
	matcher: string
	hooks: Array<{ type: string; command: string }>
}

interface McpServer {
	type?: 'stdio'
	command: string
	args: string[]
	env?: Record<string, string>
}

interface McpJson {
	mcpServers: Record<string, McpServer>
}

interface ClaudeSettings {
	hooks?: {
		PreToolUse?: HookEntry[]
		PostToolUse?: HookEntry[]
	}
	[key: string]: unknown
}

interface GeminiSettings {
	mcpServers?: Record<string, McpServer>
	[key: string]: unknown
}

interface DetectedClients {
	claude: boolean
	codex: boolean
	gemini: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

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
	'*.{js,jsx,ts,tsx,json,md,yml,yaml}': ['prettier --write']
}

const HUSKY_PRE_COMMIT = `npx lint-staged
if command -v gitleaks >/dev/null 2>&1; then
	gitleaks protect --staged --verbose
else
	echo "gitleaks not found - skipping"
fi
`

const GITLEAKS_INSTALL_HELP = `
NOTE: gitleaks not found. Install it:
  brew install gitleaks       # macOS
  apt install gitleaks        # Debian/Ubuntu
  choco install gitleaks      # Windows
  https://github.com/gitleaks/gitleaks#installing`

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function log(msg: string): void {
	console.log(msg)
}

function commandExists(cmd: string): boolean {
	try {
		const check = process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`
		execSync(check, { stdio: 'pipe' })
		return true
	} catch {
		return false
	}
}

function ensureDir(dir: string): void {
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true })
	}
}

function readJson<T>(path: string, fallback: T): T {
	if (!existsSync(path)) return fallback
	try {
		return JSON.parse(readFileSync(path, 'utf-8')) as T
	} catch {
		return fallback
	}
}

function writeJson(path: string, data: unknown): void {
	writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}

function getMcpServerCommand(): { command: string; args: string[] } {
	return { command: 'npx', args: ['--yes', '@goobits/sherpa', 'reviewer'] }
}

// ─────────────────────────────────────────────────────────────────────────────
// Client Detection
// ─────────────────────────────────────────────────────────────────────────────

function detectClients(): DetectedClients {
	return {
		claude: commandExists('claude'),
		codex: commandExists('codex'),
		gemini: commandExists('gemini')
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Configuration
// ─────────────────────────────────────────────────────────────────────────────

function setupClaudeMcp(cwd: string): void {
	const mcpPath = join(cwd, '.mcp.json')
	const { command, args } = getMcpServerCommand()

	// Try claude CLI first
	if (commandExists('claude')) {
		try {
			execSync('claude mcp remove reviewer -s project 2>/dev/null || true', { cwd, stdio: 'pipe' })
			execSync(`claude mcp add reviewer -s project -- ${command} ${args.join(' ')}`, {
				cwd,
				stdio: 'pipe'
			})
			log('  [x] Claude Code (via claude mcp add)')
			return
		} catch {
			// Fall through to manual config
		}
	}

	// Manual .mcp.json
	const mcpJson = readJson<McpJson>(mcpPath, { mcpServers: {} })
	mcpJson.mcpServers['reviewer'] = { type: 'stdio', command, args, env: {} }
	writeJson(mcpPath, mcpJson)
	log('  [x] Claude Code (.mcp.json)')
}

function setupCodexMcp(): void {
	const configPath = join(homedir(), '.codex', 'config.toml')
	const { command, args } = getMcpServerCommand()

	ensureDir(join(homedir(), '.codex'))

	const tomlEntry = `
[mcp_servers.reviewer]
command = "${command}"
args = ${JSON.stringify(args)}
`

	const existing = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : ''

	if (existing.includes('[mcp_servers.reviewer]')) {
		const updated = existing.replace(
			/\[mcp_servers\.reviewer\][^\[]*(?=\[|$)/s,
			tomlEntry.trim() + '\n\n'
		)
		writeFileSync(configPath, updated)
	} else {
		appendFileSync(configPath, tomlEntry)
	}

	log('  [x] OpenAI Codex (~/.codex/config.toml)')
}

function setupGeminiMcp(): void {
	const configPath = join(homedir(), '.gemini', 'settings.json')
	const { command, args } = getMcpServerCommand()

	ensureDir(join(homedir(), '.gemini'))

	const settings = readJson<GeminiSettings>(configPath, {})
	settings.mcpServers = settings.mcpServers || {}
	settings.mcpServers['reviewer'] = { command, args }
	writeJson(configPath, settings)

	log('  [x] Google Gemini (~/.gemini/settings.json)')
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude Hooks
// ─────────────────────────────────────────────────────────────────────────────

function setupClaudeHooks(cwd: string, force: boolean): void {
	const claudeDir = join(cwd, '.claude')
	const guardPath = join(claudeDir, 'guard.json')
	const settingsPath = join(claudeDir, 'settings.local.json')

	ensureDir(claudeDir)
	log('Created .claude/ directory')

	// guard.json
	if (!existsSync(guardPath) || force) {
		writeJson(guardPath, GUARD_CONFIG)
		log('Created .claude/guard.json')
	} else {
		log('.claude/guard.json already exists (use --force to overwrite)')
	}

	// settings.local.json
	const settings = readJson<ClaudeSettings>(settingsPath, {})
	settings.hooks = settings.hooks || {}
	let updated = false

	for (const [hookType, hooks] of Object.entries(CLAUDE_HOOK_CONFIG)) {
		const existing = settings.hooks[hookType as keyof typeof CLAUDE_HOOK_CONFIG] || []
		const hasSherpa = existing.some((h) =>
			h.hooks?.some((hook) => hook.command?.startsWith('sherpa '))
		)
		if (!hasSherpa) {
			settings.hooks[hookType as keyof typeof CLAUDE_HOOK_CONFIG] = [...existing, ...hooks]
			updated = true
		}
	}

	// Clean stale mcpServers from settings
	if ('mcpServers' in settings) {
		delete settings.mcpServers
		updated = true
	}

	if (updated) {
		writeJson(settingsPath, settings)
		log('Updated .claude/settings.local.json with hooks')
	} else {
		log('Claude hooks already configured')
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Husky
// ─────────────────────────────────────────────────────────────────────────────

function setupHusky(cwd: string, force: boolean): void {
	const huskyDir = join(cwd, '.husky')
	const preCommitPath = join(huskyDir, 'pre-commit')
	const pkgPath = join(cwd, 'package.json')

	if (!existsSync(pkgPath)) {
		log('No package.json found - skipping husky setup')
		return
	}

	try {
		JSON.parse(readFileSync(pkgPath, 'utf-8'))
	} catch {
		log('Warning: Could not parse package.json')
		return
	}

	if (!existsSync(huskyDir)) {
		try {
			log('Initializing husky...')
			execSync('npx husky init', { cwd, stdio: 'pipe' })
			log('Initialized husky')
		} catch {
			log('Could not initialize husky automatically. Run: npx husky init')
			return
		}
	}

	if (!existsSync(preCommitPath) || force) {
		writeFileSync(preCommitPath, HUSKY_PRE_COMMIT)
		chmodSync(preCommitPath, '755')
		log('Created .husky/pre-commit')
		return
	}

	const existing = readFileSync(preCommitPath, 'utf-8')
	if (existing.includes('npm test')) {
		writeFileSync(preCommitPath, HUSKY_PRE_COMMIT)
		chmodSync(preCommitPath, '755')
		log('Replaced default pre-commit with lint-staged + gitleaks')
		return
	}

	let modified = false
	if (!existing.includes('lint-staged')) {
		appendFileSync(preCommitPath, '\nnpx lint-staged\n')
		modified = true
	}
	if (!existing.includes('gitleaks')) {
		appendFileSync(preCommitPath, '\ngitleaks protect --staged --verbose\n')
		modified = true
	}

	log(modified ? 'Updated .husky/pre-commit' : '.husky/pre-commit already configured')
}

// ─────────────────────────────────────────────────────────────────────────────
// Lint-Staged
// ─────────────────────────────────────────────────────────────────────────────

function setupLintStaged(cwd: string, force: boolean): void {
	const configPath = join(cwd, '.lintstagedrc.json')

	if (!existsSync(configPath) || force) {
		writeJson(configPath, LINT_STAGED_CONFIG)
		log('Created .lintstagedrc.json')
	} else {
		log('.lintstagedrc.json already exists')
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Gitleaks
// ─────────────────────────────────────────────────────────────────────────────

function checkGitleaks(): void {
	if (commandExists('gitleaks')) {
		log('gitleaks found')
	} else {
		log(GITLEAKS_INSTALL_HELP)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function printSummary(clients: DetectedClients): void {
	const configured = [
		'  [x] Claude Code (.mcp.json)',
		clients.codex && '  [x] OpenAI Codex (~/.codex/config.toml)',
		clients.gemini && '  [x] Google Gemini (~/.gemini/settings.json)'
	]
		.filter(Boolean)
		.join('\n')

	log(`
${'='.repeat(50)}
Sherpa setup complete!

MCP server: npx @goobits/sherpa reviewer

Configured for:
${configured}

Pre-commit will run:
  1. lint-staged (lint/format changed files)
  2. gitleaks (scan for secrets)

Claude Code hooks:
  - sherpa pre: Block dangerous bash commands
  - sherpa post: Offload large outputs
  - reviewer: AI code review (MCP)

IMPORTANT: Restart your AI coding tool to load the MCP server.
${'='.repeat(50)}`)
}

export function runInit(): void {
	const args = process.argv[2] === 'init' ? process.argv.slice(3) : []
	const force = args.includes('--force')
	const cwd = process.cwd()

	log('Setting up sherpa...\n')

	// Detect CLIs
	const clients = detectClients()
	log(`Detected AI coding tools:
  Claude Code: ${clients.claude ? 'yes' : 'no (will use .mcp.json)'}
  OpenAI Codex: ${clients.codex ? 'yes' : 'no'}
  Google Gemini: ${clients.gemini ? 'yes' : 'no'}`)

	// Configure MCP
	log('\nConfiguring MCP servers...')
	setupClaudeMcp(cwd)
	if (clients.codex) setupCodexMcp()
	if (clients.gemini) setupGeminiMcp()

	// Project setup
	log('')
	setupClaudeHooks(cwd, force)
	setupHusky(cwd, force)
	setupLintStaged(cwd, force)
	checkGitleaks()

	printSummary(clients)
}
