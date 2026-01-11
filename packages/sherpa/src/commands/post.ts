/**
 * sherpa post - PostToolUse hook that offloads large outputs to scratch files
 */

import {
	countTokens,
	loadConfig,
	type PostToolOutput,
	readHookInput,
	writeHookOutput
} from '@goobits/sherpa-core'
import { createHash } from 'crypto'
import { existsSync,mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'

import { DEFAULT_CONFIG, type GuardConfig } from '../types.js'

/**
 * Load guard config from .claude/guard.json or fallback locations
 */
export function loadGuardConfig(): GuardConfig {
	const searchPaths = [
		join(process.cwd(), '.claude', 'guard.json'),
		join(process.cwd(), 'guard.json')
	]
	return loadConfig<GuardConfig>('guard.json', DEFAULT_CONFIG, searchPaths)
}

interface FileInfo {
	path: string;
	size: number;
	mtime: number;
}

/**
 * Clean up scratch files by age and size
 */
function cleanupScratch(scratchDir: string, maxAgeMinutes: number, maxSizeMB: number): void {
	try {
		if (!existsSync(scratchDir)) {return}

		const files = readdirSync(scratchDir)
		const now = Date.now()
		const maxAge = maxAgeMinutes * 60 * 1000
		const maxBytes = maxSizeMB * 1024 * 1024

		// Collect file info
		const fileInfos: FileInfo[] = []
		let totalSize = 0

		for (const file of files) {
			if (!file.startsWith('out_')) {continue}

			const filepath = join(scratchDir, file)
			try {
				const stat = statSync(filepath)
				fileInfos.push({
					path: filepath,
					size: stat.size,
					mtime: stat.mtimeMs
				})
				totalSize += stat.size
			} catch {
				// Ignore errors on individual files
			}
		}

		// Delete files older than maxAge
		for (const info of fileInfos) {
			if (now - info.mtime > maxAge) {
				try {
					unlinkSync(info.path)
					totalSize -= info.size
				} catch {
					// Ignore
				}
			}
		}

		// If still over size limit, delete oldest files (LRU)
		if (totalSize > maxBytes) {
			const remaining = fileInfos
				.filter(f => existsSync(f.path))
				.sort((a, b) => a.mtime - b.mtime) // Oldest first

			for (const info of remaining) {
				if (totalSize <= maxBytes) {break}
				try {
					unlinkSync(info.path)
					totalSize -= info.size
				} catch {
					// Ignore
				}
			}
		}
	} catch {
		// Ignore if directory doesn't exist yet
	}
}

/**
 * Generate a short hash for the output
 */
function hashOutput(content: string): string {
	return createHash('md5').update(content).digest('hex').slice(0, 8)
}

/**
 * Offload large output to a scratch file
 */
export function offloadOutput(
	output: string,
	exitCode: number,
	config: GuardConfig
): { modified: boolean; result: string } {
	const tokens = countTokens(output)
	const lines = output.split('\n')

	// Small output: pass through
	if (tokens <= config.maxTokens) {
		return { modified: false, result: output }
	}

	// Create scratch directory
	const scratchDir = join(process.cwd(), config.scratchDir)
	mkdirSync(scratchDir, { recursive: true })

	// Clean up old files and enforce size limit
	cleanupScratch(scratchDir, config.maxAgeMinutes, config.maxScratchSizeMB)

	// Save to scratch file
	const hash = hashOutput(output)
	const filename = `out_${ hash }_exit${ exitCode }.txt`
	const filepath = join(scratchDir, filename)
	writeFileSync(filepath, output)

	// Create preview (last N tokens worth of lines)
	const previewLines: string[] = []
	let previewTokens = 0
	for (let i = lines.length - 1; i >= 0 && previewTokens < config.previewTokens; i--) {
		const lineTokens = countTokens(lines[i])
		previewLines.unshift(lines[i])
		previewTokens += lineTokens
	}
	const preview = previewLines.join('\n')

	// Build pointer message
	const sizeKB = (output.length / 1024).toFixed(1)
	const result = [
		`┌─ Output offloaded (${ lines.length } lines, ${ sizeKB }KB, ~${ tokens } tokens)`,
		`│ File: ${ filepath }`,
		`│ Hint: grep <pattern> ${ filepath }`,
		`└─ Last ${ previewLines.length } lines:`,
		preview
	].join('\n')

	return { modified: true, result }
}

/**
 * Main entry point for PostToolUse hook
 */
export function runPost(): void {
	try {
		const data = readHookInput<PostToolOutput>()

		// Only handle Bash tool
		if (data.tool_name !== 'Bash') {
			writeHookOutput(data)
			return
		}

		const stdout = data.tool_result?.stdout || ''
		const stderr = data.tool_result?.stderr || ''
		const exitCode = data.tool_result?.exit_code || 0

		// Load config from .claude/guard.json or defaults
		const config = loadGuardConfig()

		// Check stdout
		const stdoutResult = offloadOutput(stdout, exitCode, config)

		// Check stderr (usually smaller, but handle anyway)
		const stderrResult = offloadOutput(stderr, exitCode, config)

		// If nothing was modified, pass through
		if (!stdoutResult.modified && !stderrResult.modified) {
			writeHookOutput(data)
			return
		}

		// Return modified result
		const result = {
			...data,
			tool_result: {
				...data.tool_result,
				stdout: stdoutResult.result,
				stderr: stderrResult.modified ? stderrResult.result : stderr
			}
		}

		writeHookOutput(result)
	} catch(error) {
		// On error, try to pass through original
		console.error('sherpa post error:', (error as Error).message)
		try {
			const data = readHookInput<PostToolOutput>()
			writeHookOutput(data)
		} catch {
			// Nothing we can do
		}
	}
}
