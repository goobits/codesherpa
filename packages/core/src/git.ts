/**
 * Git utilities: .gitignore parsing, diff operations
 */

import ignore, { type Ignore } from 'ignore';
import { execSync, exec } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Load .gitignore patterns from directory and parents
 */
export function loadGitignore(dir: string = '.'): Ignore {
	const ig = ignore();
	const absoluteDir = resolve(dir);

	// Walk up the tree loading .gitignore files
	let current = absoluteDir;
	const gitignoreFiles: string[] = [];

	while (current) {
		const gitignorePath = join(current, '.gitignore');
		if (existsSync(gitignorePath)) {
			gitignoreFiles.unshift(gitignorePath); // Add to front (parent patterns first)
		}

		// Check if we've hit the git root
		if (existsSync(join(current, '.git'))) {
			break;
		}

		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}

	// Load patterns (parent first, then child - child overrides)
	for (const path of gitignoreFiles) {
		ig.add(readFileSync(path, 'utf8'));
	}

	// Always ignore common junk
	ig.add([
		'node_modules/',
		'__pycache__/',
		'.venv/',
		'venv/',
		'dist/',
		'build/',
		'.git/',
		'.eggs/',
		'*.egg-info/',
	]);

	return ig;
}

/**
 * Filter paths, removing those matched by .gitignore
 */
export function filterIgnored(paths: string[], dir: string = '.'): string[] {
	const ig = loadGitignore(dir);
	return paths.filter((p) => !ig.ignores(p));
}

/**
 * Check if paths are ignored using git check-ignore (batch)
 */
export function getIgnoredPaths(paths: string[]): Set<string> {
	if (paths.length === 0) return new Set();

	try {
		const result = execSync('git check-ignore --stdin', {
			input: paths.join('\n'),
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		return new Set(result.trim().split('\n').filter(Boolean));
	} catch {
		return new Set();
	}
}

/**
 * Get git diff
 */
export async function getDiff(
	base: string = 'HEAD~1',
	path?: string
): Promise<string> {
	const args = ['git', 'diff', base];
	if (path) args.push('--', path);

	try {
		const { stdout } = await execAsync(args.join(' '));
		return stdout;
	} catch (error) {
		throw new Error(`Git diff failed: ${error}`);
	}
}

/**
 * Check if we're in a git repository
 */
export function isGitRepo(dir: string = '.'): boolean {
	try {
		execSync('git rev-parse --git-dir', {
			cwd: dir,
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		return true;
	} catch {
		return false;
	}
}
