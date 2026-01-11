/**
 * @mcp/guard - Unified command guard for Claude Code hooks
 *
 * Pre-hook: blocks dangerous commands
 * Post-hook: offloads large outputs to scratch files
 */

export * from './types.js';
export * from './parser.js';
export * from './rules.js';
export { checkBashCommand, runPreGuard } from './pre.js';
export { offloadOutput, runPostGuard } from './post.js';
