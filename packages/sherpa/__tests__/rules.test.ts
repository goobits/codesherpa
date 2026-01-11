import { describe, expect, test } from 'vitest'
import { matchesBlockRule, matchesAllowRule, checkCommand, checkPipeline } from '../src/rules.js'
import type { CommandInfo, Rule, RulesConfig, ASTNode } from '../src/types.js'

describe('matchesBlockRule', () => {
	test('matches command by name', () => {
		const cmdInfo: CommandInfo = {
			cmd: 'rm',
			args: [],
			flags: ['r', 'f'],
			paths: ['/'],
			raw: ['-rf', '/']
		}
		const rule: Rule = {
			name: 'rm-rf',
			cmd: 'rm',
			flags: ['r', 'f'],
			reason: 'dangerous'
		}
		expect(matchesBlockRule(cmdInfo, rule)).toBe(true)
	})

	test('does not match wrong command', () => {
		const cmdInfo: CommandInfo = {
			cmd: 'ls',
			args: [],
			flags: [],
			paths: [],
			raw: []
		}
		const rule: Rule = {
			name: 'rm-rf',
			cmd: 'rm',
			reason: 'dangerous'
		}
		expect(matchesBlockRule(cmdInfo, rule)).toBe(false)
	})

	test('matches with flagMode any', () => {
		const cmdInfo: CommandInfo = {
			cmd: 'rm',
			args: [],
			flags: ['f'],
			paths: [],
			raw: ['-f']
		}
		const rule: Rule = {
			name: 'rm-force',
			cmd: 'rm',
			flags: ['f', 'r'],
			flagMode: 'any',
			reason: 'has force or recursive'
		}
		expect(matchesBlockRule(cmdInfo, rule)).toBe(true)
	})

	test('does not match when flagMode all and missing flag', () => {
		const cmdInfo: CommandInfo = {
			cmd: 'rm',
			args: [],
			flags: ['f'],
			paths: [],
			raw: ['-f']
		}
		const rule: Rule = {
			name: 'rm-rf',
			cmd: 'rm',
			flags: ['f', 'r'],
			flagMode: 'all',
			reason: 'needs both'
		}
		expect(matchesBlockRule(cmdInfo, rule)).toBe(false)
	})

	test('matches subcommand', () => {
		const cmdInfo: CommandInfo = {
			cmd: 'git',
			args: ['push'],
			flags: ['force'],
			paths: [],
			raw: ['push', '--force'],
			subcommand: 'push'
		}
		const rule: Rule = {
			name: 'git-push-force',
			cmd: 'git',
			subcommand: 'push',
			flags: 'force',
			reason: 'force push is dangerous'
		}
		expect(matchesBlockRule(cmdInfo, rule)).toBe(true)
	})

	test('matches path patterns', () => {
		const cmdInfo: CommandInfo = {
			cmd: 'cat',
			args: ['.env'],
			flags: [],
			paths: ['.env'],
			raw: ['.env']
		}
		const rule: Rule = {
			name: 'read-env',
			cmd: 'cat',
			pathPatterns: '\\.env',
			reason: 'reading secrets'
		}
		expect(matchesBlockRule(cmdInfo, rule)).toBe(true)
	})
})

describe('matchesAllowRule', () => {
	test('matches allow rule for safe command', () => {
		const cmdInfo: CommandInfo = {
			cmd: 'ls',
			args: ['/home'],
			flags: ['l'],
			paths: ['/home'],
			raw: ['-l', '/home']
		}
		const rule: Rule = {
			name: 'ls-anywhere',
			cmd: 'ls',
			reason: 'ls is safe'
		}
		expect(matchesAllowRule(cmdInfo, rule)).toBe(true)
	})
})

describe('checkCommand', () => {
	const rules: RulesConfig = {
		block: [
			{
				name: 'rm-rf',
				cmd: 'rm',
				flags: ['r', 'f'],
				reason: 'recursive force delete is dangerous'
			},
			{
				name: 'sudo-su',
				cmd: 'sudo',
				argPatterns: 'su\\b',
				reason: 'privilege escalation'
			}
		],
		allow: [
			{
				name: 'rm-safe',
				cmd: 'rm',
				pathPatterns: '^/tmp/',
				reason: 'removing from /tmp is ok'
			}
		]
	}

	test('blocks rm -rf', () => {
		const cmdInfo: CommandInfo = {
			cmd: 'rm',
			args: ['/'],
			flags: ['r', 'f'],
			paths: ['/'],
			raw: ['-rf', '/']
		}
		const result = checkCommand(cmdInfo, rules)
		expect(result.blocked).toBe(true)
		expect(result.rule?.name).toBe('rm-rf')
	})

	test('allows rm in /tmp', () => {
		const cmdInfo: CommandInfo = {
			cmd: 'rm',
			args: ['/tmp/foo'],
			flags: ['r', 'f'],
			paths: ['/tmp/foo'],
			raw: ['-rf', '/tmp/foo']
		}
		const result = checkCommand(cmdInfo, rules)
		expect(result.blocked).toBe(false)
	})

	test('allows safe commands', () => {
		const cmdInfo: CommandInfo = {
			cmd: 'echo',
			args: ['hello'],
			flags: [],
			paths: [],
			raw: ['hello']
		}
		const result = checkCommand(cmdInfo, rules)
		expect(result.blocked).toBe(false)
	})
})

describe('checkPipeline', () => {
	const rules: RulesConfig = {
		block: [
			{
				name: 'curl-bash',
				cmd: ['curl', 'wget'],
				pipeTo: ['bash', 'sh', 'zsh'],
				reason: 'remote code execution'
			}
		],
		allow: []
	}

	test('blocks curl | bash', () => {
		const ast: ASTNode = {
			type: 'Script',
			commands: [
				{
					type: 'Pipeline',
					commands: [
						{ type: 'Command', name: { text: 'curl' } },
						{ type: 'Command', name: { text: 'bash' } }
					]
				}
			]
		}
		const result = checkPipeline(ast, rules)
		expect(result).not.toBeNull()
		expect(result?.name).toBe('curl-bash')
	})

	test('blocks wget | sh', () => {
		const ast: ASTNode = {
			type: 'Script',
			commands: [
				{
					type: 'Pipeline',
					commands: [
						{ type: 'Command', name: { text: 'wget' } },
						{ type: 'Command', name: { text: 'sh' } }
					]
				}
			]
		}
		const result = checkPipeline(ast, rules)
		expect(result).not.toBeNull()
	})

	test('allows safe pipelines', () => {
		const ast: ASTNode = {
			type: 'Script',
			commands: [
				{
					type: 'Pipeline',
					commands: [
						{ type: 'Command', name: { text: 'cat' } },
						{ type: 'Command', name: { text: 'grep' } }
					]
				}
			]
		}
		const result = checkPipeline(ast, rules)
		expect(result).toBeNull()
	})

	test('handles non-pipeline scripts', () => {
		const ast: ASTNode = {
			type: 'Script',
			commands: [
				{ type: 'Command', name: { text: 'ls' } }
			]
		}
		const result = checkPipeline(ast, rules)
		expect(result).toBeNull()
	})
})
