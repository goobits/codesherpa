/**
 * @goobits/sherpa - MCP hooks and repo setup for safer AI coding
 *
 * CLI commands:
 *   sherpa init  - Set up repo (husky, lint-staged, gitleaks, claude hooks)
 *   sherpa pre   - PreToolUse hook (blocks dangerous commands)
 *   sherpa post  - PostToolUse hook (offloads large output)
 */

export { runInit } from './commands/init.js'
export { offloadOutput, runPost } from './commands/post.js'
export { checkBashCommand, runPre } from './commands/pre.js'
export * from './parser.js'
export * from './rules.js'
export * from './types.js'
