import { describe, expect, test } from 'vitest'

import { extractCommands, normalizePath, parseCommand } from '../src/parser.js'
import type { ASTNode } from '../src/types.js'

describe('normalizePath', () => {
	test('handles empty path', () => {
		const result = normalizePath('')
		expect(result.original).toBe('')
		expect(result.normalized).toBe('')
		expect(result.hasTraversal).toBe(false)
		expect(result.isAbsolute).toBe(false)
	})

	test('handles absolute path', () => {
		const result = normalizePath('/usr/bin/node')
		expect(result.original).toBe('/usr/bin/node')
		expect(result.normalized).toBe('/usr/bin/node')
		expect(result.hasTraversal).toBe(false)
		expect(result.isAbsolute).toBe(true)
	})

	test('detects traversal in path', () => {
		const result = normalizePath('/tmp/../etc/passwd')
		expect(result.original).toBe('/tmp/../etc/passwd')
		expect(result.normalized).toBe('/etc/passwd')
		expect(result.hasTraversal).toBe(true)
	})

	test('normalizes double traversal', () => {
		const result = normalizePath('/a/b/c/../../d')
		expect(result.normalized).toBe('/a/d')
		expect(result.hasTraversal).toBe(true)
	})

	test('handles tilde as absolute', () => {
		const result = normalizePath('~/Documents')
		expect(result.isAbsolute).toBe(true)
		expect(result.normalized).toContain('Documents')
	})

	test('handles relative path', () => {
		const result = normalizePath('./src/index.ts')
		expect(result.isAbsolute).toBe(false)
		expect(result.hasTraversal).toBe(false)
	})
})

describe('parseCommand', () => {
	test('parses simple command', () => {
		const node: ASTNode = {
			type: 'Command',
			name: { text: 'ls' },
			suffix: [ { text: '-la' } ]
		}
		const result = parseCommand(node)
		expect(result?.cmd).toBe('ls')
		expect(result?.flags).toContain('l')
		expect(result?.flags).toContain('a')
	})

	test('parses command with long flags', () => {
		const node: ASTNode = {
			type: 'Command',
			name: { text: 'rm' },
			suffix: [ { text: '--recursive' }, { text: '--force' }, { text: '/tmp/foo' } ]
		}
		const result = parseCommand(node)
		expect(result?.cmd).toBe('rm')
		expect(result?.flags).toContain('recursive')
		expect(result?.flags).toContain('force')
		expect(result?.paths).toContain('/tmp/foo')
	})

	test('parses git subcommand', () => {
		const node: ASTNode = {
			type: 'Command',
			name: { text: 'git' },
			suffix: [ { text: 'push' }, { text: '--force' }, { text: 'origin' }, { text: 'main' } ]
		}
		const result = parseCommand(node)
		expect(result?.cmd).toBe('git')
		expect(result?.subcommand).toBe('push')
		expect(result?.flags).toContain('force')
		expect(result?.subArgs).toEqual([ 'origin', 'main' ])
	})

	test('handles command with no name', () => {
		const node: ASTNode = { type: 'Command' }
		const result = parseCommand(node)
		expect(result).toBeNull()
	})

	test('does not treat negative numbers as flags', () => {
		const node: ASTNode = {
			type: 'Command',
			name: { text: 'head' },
			suffix: [ { text: '-10' }, { text: 'file.txt' } ]
		}
		const result = parseCommand(node)
		expect(result?.flags).not.toContain('1')
		expect(result?.flags).not.toContain('0')
	})
})

describe('extractCommands', () => {
	test('handles null node', () => {
		const result = extractCommands(null)
		expect(result).toEqual([])
	})

	test('extracts commands from Script', () => {
		const script: ASTNode = {
			type: 'Script',
			commands: [
				{ type: 'Command', name: { text: 'echo' }, suffix: [ { text: 'hello' } ] },
				{ type: 'Command', name: { text: 'ls' }, suffix: [] }
			]
		}
		const result = extractCommands(script)
		expect(result).toHaveLength(2)
		expect(result[0].cmd).toBe('echo')
		expect(result[1].cmd).toBe('ls')
	})

	test('extracts commands from LogicalExpression', () => {
		const expr: ASTNode = {
			type: 'LogicalExpression',
			left: { type: 'Command', name: { text: 'true' }, suffix: [] },
			right: { type: 'Command', name: { text: 'echo' }, suffix: [ { text: 'yes' } ] }
		}
		const result = extractCommands(expr)
		expect(result).toHaveLength(2)
	})

	test('extracts commands from Pipeline', () => {
		const pipeline: ASTNode = {
			type: 'Pipeline',
			commands: [
				{ type: 'Command', name: { text: 'cat' }, suffix: [ { text: 'file' } ] },
				{ type: 'Command', name: { text: 'grep' }, suffix: [ { text: 'pattern' } ] }
			]
		}
		const result = extractCommands(pipeline)
		expect(result).toHaveLength(2)
		expect(result[0].cmd).toBe('cat')
		expect(result[1].cmd).toBe('grep')
	})
})
