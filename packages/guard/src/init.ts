#!/usr/bin/env node
/**
 * Guard init - easy setup for new projects
 *
 * Usage: guard-init [--force]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ClaudeSettings {
	hooks?: {
		PreToolUse?: Array<{ matcher: string; command: string }>;
		PostToolUse?: Array<{ matcher: string; command: string }>;
	};
	[key: string]: unknown;
}

const HOOK_CONFIG = {
	PreToolUse: [{ matcher: 'Bash', command: 'guard-pre' }],
	PostToolUse: [{ matcher: 'Bash', command: 'guard-post' }],
};

export function runInit(): void {
	const force = process.argv.includes('--force');
	const cwd = process.cwd();
	const claudeDir = join(cwd, '.claude');
	const configPath = join(claudeDir, 'guard.json');
	const settingsPath = join(claudeDir, 'settings.local.json');

	console.log('Setting up @mcp/guard...\n');

	// Create .claude directory
	if (!existsSync(claudeDir)) {
		mkdirSync(claudeDir, { recursive: true });
		console.log('Created .claude/ directory');
	}

	// Copy guard config
	if (!existsSync(configPath) || force) {
		const templatePath = join(__dirname, '..', 'guard.example.json');
		if (existsSync(templatePath)) {
			const template = readFileSync(templatePath, 'utf-8');
			writeFileSync(configPath, template);
			console.log('Created .claude/guard.json');
		} else {
			// Fallback: create minimal config
			const defaultConfig = {
				$schema: 'https://raw.githubusercontent.com/anthropics/mcp-servers/main/packages/guard/config-schema.json',
				maxTokens: 2000,
				previewTokens: 500,
				scratchDir: '.claude/scratch',
				maxAgeMinutes: 60,
				maxScratchSizeMB: 50,
			};
			writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + '\n');
			console.log('Created .claude/guard.json');
		}
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

	for (const [hookType, hooks] of Object.entries(HOOK_CONFIG)) {
		const existing = settings.hooks[hookType as keyof typeof HOOK_CONFIG] || [];
		const hasGuard = existing.some(
			(h) => h.command === 'guard-pre' || h.command === 'guard-post'
		);

		if (!hasGuard) {
			settings.hooks[hookType as keyof typeof HOOK_CONFIG] = [...existing, ...hooks];
			updated = true;
		}
	}

	if (updated) {
		writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
		console.log('Updated .claude/settings.local.json with hook config');
	} else {
		console.log('Hooks already configured in .claude/settings.local.json');
	}

	// Print success message
	console.log('\nSetup complete!\n');
	console.log('Guard will now:');
	console.log('  - Block dangerous bash commands (PreToolUse)');
	console.log('  - Offload large outputs to .claude/scratch/ (PostToolUse)\n');
	console.log('To customize, edit .claude/guard.json');
}

// Run if called directly
if (process.argv[1]?.includes('init')) {
	runInit();
}
