/**
 * sherpa init - Set up repo with husky, lint-staged, gitleaks, and claude hooks
 *
 * Usage: sherpa init [--force]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ClaudeSettings {
	hooks?: {
		PreToolUse?: Array<{ matcher: string; command: string }>;
		PostToolUse?: Array<{ matcher: string; command: string }>;
	};
	[key: string]: unknown;
}

interface PackageJson {
	scripts?: Record<string, string>;
	devDependencies?: Record<string, string>;
	[key: string]: unknown;
}

const CLAUDE_HOOK_CONFIG = {
	PreToolUse: [{ matcher: 'Bash', command: 'sherpa pre' }],
	PostToolUse: [{ matcher: 'Bash', command: 'sherpa post' }],
};

const GUARD_CONFIG = {
	maxTokens: 2000,
	previewTokens: 500,
	scratchDir: '.claude/scratch',
	maxAgeMinutes: 60,
	maxScratchSizeMB: 50,
};

const LINT_STAGED_CONFIG = {
	'*.{js,jsx,ts,tsx}': ['eslint --fix'],
	'*.{json,md,yml,yaml}': ['prettier --write'],
};

const HUSKY_PRE_COMMIT = `#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx lint-staged
gitleaks protect --staged --verbose
`;

export function runInit(): void {
	const force = process.argv.includes('--force');
	const cwd = process.cwd();

	console.log('Setting up sherpa...\n');

	// 1. Create .claude directory and config
	setupClaudeConfig(cwd, force);

	// 2. Set up husky
	setupHusky(cwd, force);

	// 3. Set up lint-staged
	setupLintStaged(cwd, force);

	// 4. Check for gitleaks
	checkGitleaks();

	// Print success
	console.log('\n' + '='.repeat(50));
	console.log('Sherpa setup complete!\n');
	console.log('What was configured:');
	console.log('  [x] .claude/settings.local.json - Claude Code hooks');
	console.log('  [x] .claude/guard.json - Guard configuration');
	console.log('  [x] .husky/pre-commit - Git pre-commit hook');
	console.log('  [x] .lintstagedrc.json - Lint staged files');
	console.log('');
	console.log('Pre-commit will run:');
	console.log('  1. lint-staged (lint/format changed files)');
	console.log('  2. gitleaks (scan for secrets)');
	console.log('');
	console.log('Claude hooks will:');
	console.log('  - Block dangerous bash commands (sherpa pre)');
	console.log('  - Offload large outputs (sherpa post)');
	console.log('='.repeat(50));
}

function setupClaudeConfig(cwd: string, force: boolean): void {
	const claudeDir = join(cwd, '.claude');
	const configPath = join(claudeDir, 'guard.json');
	const settingsPath = join(claudeDir, 'settings.local.json');

	// Create .claude directory
	if (!existsSync(claudeDir)) {
		mkdirSync(claudeDir, { recursive: true });
		console.log('Created .claude/ directory');
	}

	// Create guard.json
	if (!existsSync(configPath) || force) {
		writeFileSync(configPath, JSON.stringify(GUARD_CONFIG, null, 2) + '\n');
		console.log('Created .claude/guard.json');
	} else {
		console.log('.claude/guard.json already exists (use --force to overwrite)');
	}

	// Update settings.local.json
	let settings: ClaudeSettings = {};
	if (existsSync(settingsPath)) {
		try {
			settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
		} catch {
			console.warn('Warning: Could not parse existing settings.local.json');
		}
	}

	// Merge hook config
	settings.hooks = settings.hooks || {};
	let updated = false;

	for (const [hookType, hooks] of Object.entries(CLAUDE_HOOK_CONFIG)) {
		const existing = settings.hooks[hookType as keyof typeof CLAUDE_HOOK_CONFIG] || [];
		const hasSherpa = existing.some(
			(h) => h.command.startsWith('sherpa ')
		);

		if (!hasSherpa) {
			settings.hooks[hookType as keyof typeof CLAUDE_HOOK_CONFIG] = [...existing, ...hooks];
			updated = true;
		}
	}

	if (updated) {
		writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
		console.log('Updated .claude/settings.local.json with hook config');
	} else {
		console.log('Claude hooks already configured');
	}
}

function setupHusky(cwd: string, force: boolean): void {
	const huskyDir = join(cwd, '.husky');
	const preCommitPath = join(huskyDir, 'pre-commit');
	const pkgPath = join(cwd, 'package.json');

	// Check if package.json exists
	if (!existsSync(pkgPath)) {
		console.log('No package.json found - skipping husky setup');
		return;
	}

	// Read package.json
	let pkg: PackageJson;
	try {
		pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
	} catch {
		console.warn('Warning: Could not parse package.json');
		return;
	}

	// Check if husky is already set up
	const hasHusky = existsSync(huskyDir);

	if (!hasHusky) {
		// Initialize husky
		try {
			console.log('Initializing husky...');
			execSync('npx husky init', { cwd, stdio: 'pipe' });
			console.log('Initialized husky');
		} catch (error) {
			console.warn('Could not initialize husky automatically');
			console.warn('Run: npx husky init');
			return;
		}
	}

	// Create/update pre-commit hook
	if (!existsSync(preCommitPath) || force) {
		writeFileSync(preCommitPath, HUSKY_PRE_COMMIT);
		chmodSync(preCommitPath, '755');
		console.log('Created .husky/pre-commit');
	} else {
		// Check if gitleaks is already in the hook
		const existing = readFileSync(preCommitPath, 'utf-8');
		if (!existing.includes('gitleaks')) {
			appendFileSync(preCommitPath, '\ngitleaks protect --staged --verbose\n');
			console.log('Added gitleaks to existing pre-commit hook');
		} else {
			console.log('.husky/pre-commit already configured');
		}
	}
}

function setupLintStaged(cwd: string, force: boolean): void {
	const configPath = join(cwd, '.lintstagedrc.json');

	if (!existsSync(configPath) || force) {
		writeFileSync(configPath, JSON.stringify(LINT_STAGED_CONFIG, null, 2) + '\n');
		console.log('Created .lintstagedrc.json');
	} else {
		console.log('.lintstagedrc.json already exists');
	}
}

function checkGitleaks(): void {
	try {
		// Use 'command -v' on Unix, 'where' on Windows
		const checkCmd = process.platform === 'win32' ? 'where gitleaks' : 'command -v gitleaks';
		execSync(checkCmd, { stdio: 'pipe' });
		console.log('gitleaks found');
	} catch {
		console.log('');
		console.log('NOTE: gitleaks not found. Install it:');
		console.log('  brew install gitleaks       # macOS');
		console.log('  apt install gitleaks        # Debian/Ubuntu');
		console.log('  choco install gitleaks      # Windows');
		console.log('  https://github.com/gitleaks/gitleaks#installing');
	}
}
