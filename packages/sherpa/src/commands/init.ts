/**
 * sherpa init - Set up repo with husky, lint-staged, gitleaks, and claude hooks
 *
 * Usage: sherpa init [--force]
 */

import { execSync } from 'child_process'
import { createRequire } from 'module'
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface HookEntry {
  matcher: string
  hooks: Array<{ type: string; command: string }>
}

interface McpServer {
  type: 'stdio'
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

/**
 * Get absolute path to reviewer dist
 */
function getReviewerPath(): string {
  const require = createRequire(import.meta.url)
  const bundledPath = resolve(__dirname, '..', 'reviewer', 'index.js')
  if (existsSync(bundledPath)) {
    return bundledPath
  }
  try {
    return require.resolve('@goobits/sherpa-reviewer/dist/index.js')
  } catch {
    // Fall through to monorepo path
  }

  // __dirname is packages/sherpa/dist/commands in compiled code
  // Reviewer is at packages/reviewer/dist/index.js
  const reviewerPath = resolve(__dirname, '../../../reviewer/dist/index.js')
  if (existsSync(reviewerPath)) {
    return reviewerPath
  }

  return reviewerPath
}

function commandExists(command: string): boolean {
  try {
    const checkCmd = process.platform === 'win32' ? `where ${command}` : `command -v ${command}`
    execSync(checkCmd, { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function getLocalReviewerPath(cwd: string): string | null {
  const localPath = join(cwd, 'node_modules', '@goobits', 'sherpa', 'dist', 'reviewer', 'index.js')
  if (existsSync(localPath)) {
    return './node_modules/@goobits/sherpa/dist/reviewer/index.js'
  }

  return null
}

function getPackageManager(cwd: string): 'pnpm' | 'npm' | 'yarn' | 'bun' | null {
  const pkgPath = join(cwd, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { packageManager?: string }
      if (pkg.packageManager) {
        const name = pkg.packageManager.split('@')[0]
        if (name === 'pnpm' || name === 'npm' || name === 'yarn' || name === 'bun') {
          return name
        }
      }
    } catch {}
  }

  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) {
    return 'pnpm'
  }
  if (existsSync(join(cwd, 'yarn.lock'))) {
    return 'yarn'
  }
  if (existsSync(join(cwd, 'package-lock.json'))) {
    return 'npm'
  }
  if (existsSync(join(cwd, 'bun.lockb'))) {
    return 'bun'
  }

  return null
}

function installLocalSherpa(cwd: string): boolean {
  const pkgPath = join(cwd, 'package.json')
  if (!existsSync(pkgPath)) {
    return false
  }

  const packageManager = getPackageManager(cwd)
  if (!packageManager || !commandExists(packageManager)) {
    return false
  }

  const installCommand =
    packageManager === 'pnpm'
      ? 'pnpm add -D @goobits/sherpa'
      : packageManager === 'yarn'
        ? 'yarn add -D @goobits/sherpa'
        : packageManager === 'bun'
          ? 'bun add -D @goobits/sherpa'
          : 'npm install -D @goobits/sherpa'

  try {
    console.log(`Installing @goobits/sherpa locally with ${packageManager}...`)
    execSync(installCommand, { cwd, stdio: 'pipe' })
  } catch {
    console.warn(`Warning: Failed to install @goobits/sherpa with ${packageManager}.`)
    return false
  }

  return true
}

function quoteArg(arg: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(arg)) {
    return arg
  }

  return `"${arg.replace(/"/g, '\\"')}"`
}

function getMcpCommand(cwd: string): { command: string; args: string[]; isPortable: boolean } {
  const localReviewer = getLocalReviewerPath(cwd)
  if (localReviewer) {
    return { command: 'node', args: [localReviewer], isPortable: true }
  }

  if (commandExists('reviewer')) {
    return { command: 'reviewer', args: [], isPortable: true }
  }

  return { command: 'node', args: [getReviewerPath()], isPortable: false }
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

  // 6. Check for gitleaks
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
  console.log('  - reviewer: AI code review (MCP)')
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
    const hasSherpa = existing.some((h) =>
      h.hooks?.some((hook: { command?: string }) => hook.command?.startsWith('sherpa '))
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
  const settingsPath = join(cwd, '.claude/settings.local.json')

  if (!getLocalReviewerPath(cwd) && !commandExists('reviewer')) {
    if (installLocalSherpa(cwd)) {
      console.log('Installed @goobits/sherpa for portable MCP config.')
    }
  }

  const mcpCommand = getMcpCommand(cwd)

  // 1. Clean up stale MCP config from settings.local.json (wrong location)
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      if (settings.mcpServers) {
        delete settings.mcpServers
        writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`)
        console.log('Cleaned up stale MCP config from settings.local.json')
      }
    } catch {
      // Ignore parse errors
    }
  }

  const mcpConfig: McpServer = {
    type: 'stdio',
    command: mcpCommand.command,
    args: mcpCommand.args,
    env: {}
  }

  if (!mcpCommand.isPortable) {
    console.warn('Warning: reviewer path is outside the project.')
    console.warn('Install @goobits/sherpa locally (devDependency) to keep .mcp.json portable.')
  }

  // 2. Try using claude CLI first (most reliable)
  try {
    // Remove existing and add fresh (always, to ensure correct config)
    execSync('claude mcp remove reviewer -s project 2>/dev/null || true', {
      cwd,
      stdio: 'pipe'
    })
    execSync('claude mcp remove cerebras-reviewer -s project 2>/dev/null || true', {
      cwd,
      stdio: 'pipe'
    })
    const addArgs = [
      'claude',
      'mcp',
      'add',
      'reviewer',
      '-s',
      'project',
      mcpCommand.command,
      ...mcpCommand.args
    ]
    execSync(addArgs.map(quoteArg).join(' '), {
      cwd,
      stdio: 'pipe'
    })
    console.log('Configured MCP server via claude CLI')
    return
  } catch {
    // Claude CLI not available, fall back to manual config
  }

  // 3. Manual .mcp.json creation (always overwrite reviewer to fix any issues)
  let mcpJson: McpJson = { mcpServers: {} }
  if (existsSync(mcpPath)) {
    try {
      mcpJson = JSON.parse(readFileSync(mcpPath, 'utf-8'))
    } catch {
      // Start fresh if parse fails
    }
  }

  delete mcpJson.mcpServers['cerebras-reviewer']
  mcpJson.mcpServers['reviewer'] = mcpConfig
  writeFileSync(mcpPath, `${JSON.stringify(mcpJson, null, 2)}\n`)
  console.log('Configured .mcp.json with reviewer')

  // 4. Verify it works
  try {
    const testMsg =
      '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
    const runCommand = [mcpCommand.command, ...mcpCommand.args].map(quoteArg).join(' ')
    execSync(`echo '${testMsg}' | ${runCommand}`, {
      stdio: 'pipe',
      timeout: 5000
    })
    console.log('Verified MCP server responds correctly')
  } catch {
    console.warn('Warning: MCP server test failed - check paths and try restarting Claude Code')
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
    if (existing.includes('npm test')) {
      writeFileSync(preCommitPath, HUSKY_PRE_COMMIT)
      chmodSync(preCommitPath, '755')
      console.log('Replaced default pre-commit with lint-staged + gitleaks')
      return
    }

    let updated = false

    if (!existing.includes('lint-staged')) {
      appendFileSync(preCommitPath, '\nnpx lint-staged\n')
      updated = true
    }

    if (!existing.includes('gitleaks')) {
      appendFileSync(preCommitPath, '\ngitleaks protect --staged --verbose\n')
      updated = true
    }

    if (updated) {
      console.log('Updated .husky/pre-commit with lint-staged + gitleaks')
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
