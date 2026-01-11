/**
 * File utilities: glob patterns, line-numbered formatting
 */

import { readFileSync, statSync } from 'fs'
import { glob } from 'glob'

import { filterIgnored } from './git.js'

/** Code file extensions to include */
export const CODE_EXTENSIONS = new Set([
	'.py',
	'.rs',
	'.ts',
	'.js',
	'.svelte',
	'.tsx',
	'.jsx',
	'.go',
	'.java',
	'.rb',
	'.sh',
	'.json',
	'.yaml',
	'.yml',
	'.toml',
	'.md'
])

/**
 * Find files matching glob pattern, respecting .gitignore
 */
export async function findFiles(
	pattern: string,
	options: { codeOnly?: boolean } = {}
): Promise<string[]> {
	const files = await glob(pattern, {
		ignore: [
			'**/node_modules/**',
			'**/.venv/**',
			'**/venv/**',
			'**/dist/**',
			'**/build/**',
			'**/__pycache__/**',
			'**/.git/**'
		],
		nodir: true,
		dot: false
	})

	// Filter by .gitignore
	let filtered = filterIgnored(files)

	// Filter by code extensions if requested
	if (options.codeOnly) {
		filtered = filtered.filter(f => {
			const ext = f.substring(f.lastIndexOf('.'))
			return CODE_EXTENSIONS.has(ext)
		})
	}

	return filtered.sort()
}

/**
 * Format file content with line numbers
 */
export function formatWithLineNumbers(path: string): string {
	const content = readFileSync(path, 'utf8')
	const lines = content.split('\n')
	const totalLines = lines.length

	const numbered = lines.map(
		(line, i) => `${ String(i + 1).padStart(4) } | ${ line }`
	)

	return `
--- BEGIN FILE: ${ path } (lines 1-${ totalLines }) ---
${ numbered.join('\n') }
--- END FILE: ${ path } ---
`
}

/**
 * Read multiple files with size limit
 */
export function readFilesWithLimit(
	paths: string[],
	maxBytes: number = 120_000
): { files: string[]; truncated: number } {
	const files: string[] = []
	let totalSize = 0
	let truncated = 0

	for (const path of paths) {
		try {
			const stat = statSync(path)
			const formatted = formatWithLineNumbers(path)

			if (totalSize + formatted.length > maxBytes) {
				truncated = paths.length - files.length
				break
			}

			files.push(formatted)
			totalSize += formatted.length
		} catch {
			// Skip unreadable files
		}
	}

	return { files, truncated }
}

/**
 * Check if path is a file
 */
export function isFile(path: string): boolean {
	try {
		return statSync(path).isFile()
	} catch {
		return false
	}
}

/**
 * Check if path is a directory
 */
export function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory()
	} catch {
		return false
	}
}
