import { describe, expect, test } from 'vitest'
import { offloadOutput } from '../src/commands/post.js'
import type { GuardConfig } from '../src/types.js'

const testConfig: GuardConfig = {
	maxTokens: 100,
	previewTokens: 20,
	scratchDir: '.claude/scratch',
	maxAgeMinutes: 60,
	maxScratchSizeMB: 50,
	socketPath: '/tmp/test.sock'
}

describe('offloadOutput', () => {
	test('passes through small output unchanged', () => {
		const smallOutput = 'Hello world'
		const result = offloadOutput(smallOutput, 0, testConfig)
		expect(result.modified).toBe(false)
		expect(result.result).toBe(smallOutput)
	})

	test('offloads large output', () => {
		// Generate output larger than 100 tokens
		const largeOutput = Array(500).fill('This is a line of output that will be repeated many times.').join('\n')
		const result = offloadOutput(largeOutput, 0, testConfig)
		expect(result.modified).toBe(true)
		expect(result.result).toContain('Output offloaded')
		expect(result.result).toContain('.claude/scratch')
		expect(result.result).toContain('tokens')
	})

	test('includes exit code in filename', () => {
		const largeOutput = Array(500).fill('line').join('\n')
		const result = offloadOutput(largeOutput, 1, testConfig)
		expect(result.modified).toBe(true)
		expect(result.result).toContain('exit1')
	})

	test('includes preview of last lines', () => {
		const lines = Array(500).fill(0).map((_, i) => `Line ${i}`)
		const largeOutput = lines.join('\n')
		const result = offloadOutput(largeOutput, 0, testConfig)
		expect(result.modified).toBe(true)
		// Should contain some of the last lines
		expect(result.result).toContain('Line 499')
	})

	test('shows file path hint', () => {
		const largeOutput = Array(500).fill('line').join('\n')
		const result = offloadOutput(largeOutput, 0, testConfig)
		expect(result.result).toContain('Hint: grep')
	})
})
