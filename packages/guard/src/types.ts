/**
 * Type definitions for guard
 */

/** Parsed command info extracted from AST */
export interface CommandInfo {
	cmd: string;
	args: string[];
	flags: string[];
	paths: string[];
	raw: string[];
	subcommand?: string;
	subArgs?: string[];
}

/** Normalized path info for traversal detection */
export interface PathInfo {
	original: string;
	normalized: string;
	hasTraversal: boolean;
	isAbsolute: boolean;
}

/** Rule definition for blocking/allowing commands */
export interface Rule {
	name: string;
	cmd?: string | string[];
	subcommand?: string;
	flags?: string | string[];
	flagMode?: 'all' | 'any';
	pathPatterns?: string | string[];
	argPatterns?: string | string[];
	pipeTo?: string | string[];
	reason: string;
}

/** Rules configuration */
export interface RulesConfig {
	block: Rule[];
	allow: Rule[];
}

/** Check result */
export interface CheckResult {
	blocked: boolean;
	rule?: Rule;
	reason?: string;
}

/** Bash parser AST node types */
export interface ASTNode {
	type: string;
	commands?: ASTNode[];
	left?: ASTNode;
	right?: ASTNode;
	list?: ASTNode[];
	name?: { text: string };
	suffix?: Array<{ text: string }>;
}

/** Guard configuration */
export interface GuardConfig {
	maxTokens: number;
	previewTokens: number;
	scratchDir: string;
	maxAgeMinutes: number;
	socketPath: string;
}

/** Default guard configuration */
export const DEFAULT_CONFIG: GuardConfig = {
	maxTokens: 2000,
	previewTokens: 500,
	scratchDir: '.claude/scratch',
	maxAgeMinutes: 60,
	socketPath: '/tmp/mcp-guard.sock',
};
