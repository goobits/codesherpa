/**
 * Token counting utilities using tiktoken (Rust/WASM)
 */

import { get_encoding, type Tiktoken } from 'tiktoken'

let encoder: Tiktoken | null = null

/**
 * Get or create the tokenizer instance
 */
function getEncoder(): Tiktoken {
	if (!encoder) {
		// cl100k_base is used by GPT-4, Claude uses similar tokenization
		encoder = get_encoding('cl100k_base')
	}
	return encoder
}

/**
 * Count tokens accurately using tiktoken
 */
export function countTokens(text: string): number {
	return getEncoder().encode(text).length
}

/**
 * Estimate tokens quickly without full tokenization
 * ~4 chars per token for code, useful for quick checks
 */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4)
}

/**
 * Check if text exceeds token limit
 */
export function exceedsTokenLimit(text: string, limit: number): boolean {
	// Quick estimate first
	if (estimateTokens(text) < limit * 0.8) {
		return false
	}
	// Accurate count if close to limit
	return countTokens(text) > limit
}

/**
 * Truncate text to fit within token limit
 */
export function truncateToTokens(text: string, maxTokens: number): string {
	const tokens = getEncoder().encode(text)
	if (tokens.length <= maxTokens) {
		return text
	}
	const truncated = tokens.slice(0, maxTokens)
	const decoded = getEncoder().decode(truncated)
	return new TextDecoder().decode(decoded)
}

/**
 * Free the encoder when done (optional, for memory cleanup)
 */
export function freeEncoder(): void {
	if (encoder) {
		encoder.free()
		encoder = null
	}
}
