/**
 * Shared utilities for Claude Code hooks
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * PreToolUse hook input structure
 */
export interface PreToolInput {
	tool_name?: string;
	tool_input?: {
		command?: string;
		[key: string]: unknown;
	};
}

/**
 * PostToolUse hook input structure
 */
export interface PostToolOutput {
	tool_name?: string;
	tool_input?: {
		command?: string;
		[key: string]: unknown;
	};
	tool_result?: {
		stdout?: string;
		stderr?: string;
		exit_code?: number;
		[key: string]: unknown;
	};
}

/**
 * Read hook input from stdin
 */
export function readHookInput<T>(): T {
	const input = readFileSync(0, 'utf-8');
	return JSON.parse(input) as T;
}

/**
 * Write hook output to stdout
 */
export function writeHookOutput(data: unknown): void {
	console.log(JSON.stringify(data));
}

/**
 * Exit codes for hooks
 */
export const EXIT = {
	ALLOW: 0,
	BLOCK: 2,
} as const;

/**
 * Load JSON config with defaults
 */
export function loadConfig<T extends object>(
	configName: string,
	defaults: T,
	searchPaths: string[] = [process.cwd(), join(process.cwd(), '..')]
): T {
	for (const basePath of searchPaths) {
		const configPath = join(basePath, configName);
		if (existsSync(configPath)) {
			try {
				const content = readFileSync(configPath, 'utf-8');
				const loaded = JSON.parse(content);
				return { ...defaults, ...loaded };
			} catch {
				// Ignore parse errors, use defaults
			}
		}
	}
	return defaults;
}

/**
 * Load config from environment variables with prefix
 */
export function loadEnvConfig<T extends object>(
	prefix: string,
	defaults: T
): T {
	const result = { ...defaults };

	for (const key of Object.keys(defaults)) {
		const envKey = `${prefix}_${key.toUpperCase()}`;
		const envValue = process.env[envKey];

		if (envValue !== undefined) {
			const defaultValue = defaults[key as keyof T];

			// Type coercion based on default value type
			if (typeof defaultValue === 'number') {
				(result as Record<string, unknown>)[key] = parseInt(envValue, 10);
			} else if (typeof defaultValue === 'boolean') {
				(result as Record<string, unknown>)[key] = envValue === 'true';
			} else {
				(result as Record<string, unknown>)[key] = envValue;
			}
		}
	}

	return result;
}
