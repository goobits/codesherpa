/**
 * LLM utilities: Multi-provider support (Cerebras, Groq, OpenAI-compatible)
 */

import OpenAI from 'openai'

/** Supported LLM providers */
export type Provider = 'cerebras' | 'groq' | 'openai'

/** Provider configuration */
interface ProviderConfig {
	baseURL: string;
	envKey: string;
	defaultModel: string;
}

const PROVIDERS: Record<Provider, ProviderConfig> = {
	cerebras: {
		baseURL: 'https://api.cerebras.ai/v1',
		envKey: 'CEREBRAS_API_KEY',
		defaultModel: 'qwen-3-32b'
	},
	groq: {
		baseURL: 'https://api.groq.com/openai/v1',
		envKey: 'GROQ_API_KEY',
		defaultModel: 'llama-3.3-70b-versatile'
	},
	openai: {
		baseURL: 'https://api.openai.com/v1',
		envKey: 'OPENAI_API_KEY',
		defaultModel: 'gpt-4o-mini'
	}
}

// Client cache per provider
const clients = new Map<Provider, OpenAI>()

/**
 * Get available providers (those with API keys set)
 */
export function getAvailableProviders(): Provider[] {
	return (Object.keys(PROVIDERS) as Provider[]).filter(
		provider => !!process.env[PROVIDERS[provider].envKey]
	)
}

/**
 * Get or create client for a specific provider
 */
function getClient(provider: Provider): OpenAI {
	let client = clients.get(provider)
	if (!client) {
		const config = PROVIDERS[provider]
		const apiKey = process.env[config.envKey]
		if (!apiKey) {
			throw new Error(`${ config.envKey } environment variable not set`)
		}
		client = new OpenAI({
			apiKey,
			baseURL: config.baseURL
		})
		clients.set(provider, client)
	}
	return client
}

/**
 * Get the default provider (first available)
 */
function getDefaultProvider(): Provider {
	const available = getAvailableProviders()
	if (available.length === 0) {
		throw new Error('No LLM provider configured. Set CEREBRAS_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY')
	}
	return available[0]
}

/** Chat options */
export interface ChatOptions {
	system?: string;
	model?: string;
	provider?: Provider;
	fallback?: boolean; // Try next provider on failure
}

/**
 * Chat with LLM (supports multiple providers with fallback)
 */
export async function chat(
	prompt: string,
	options: ChatOptions = {}
): Promise<string> {
	const { system, fallback = true } = options
	let { provider, model } = options

	// Get provider and model
	if (!provider) {
		provider = getDefaultProvider()
	}
	if (!model) {
		model = PROVIDERS[provider].defaultModel
	}

	const messages: OpenAI.ChatCompletionMessageParam[] = []
	if (system) {
		messages.push({ role: 'system', content: system })
	}
	messages.push({ role: 'user', content: prompt })

	try {
		const response = await getClient(provider).chat.completions.create({
			model,
			messages
		})

		return response.choices[0]?.message?.content || ''
	} catch (error) {
		// Try fallback to next available provider
		if (fallback) {
			const available = getAvailableProviders().filter(p => p !== provider)
			for (const nextProvider of available) {
				try {
					const nextModel = PROVIDERS[nextProvider].defaultModel
					const response = await getClient(nextProvider).chat.completions.create({
						model: nextModel,
						messages
					})
					return response.choices[0]?.message?.content || ''
				} catch {
					// Continue to next provider
				}
			}
		}

		throw new Error(`LLM API error (${ provider }): ${ error }`)
	}
}
