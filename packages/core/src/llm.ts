/**
 * LLM utilities: Multi-provider support (Cerebras, Groq, OpenAI-compatible)
 */

import { existsSync, readFileSync } from 'fs'
import OpenAI from 'openai'
import { join } from 'path'

// Auto-load .env files (simple implementation, no dotenv dependency)
function loadEnvFiles(): void {
  const envPaths = [
    join(process.cwd(), '.env'),
    join(process.cwd(), '..', '.env'),
    join(process.cwd(), '..', '..', '.env'),
    join(process.cwd(), 'packages', 'backend', '.env')
  ]

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf-8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=')
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim()
            const value = trimmed.slice(eqIdx + 1).trim()
            // Only set if not already defined
            if (!process.env[key]) {
              process.env[key] = value
            }
          }
        }
      }
    }
  }
}

// Load env on module init
loadEnvFiles()

/** Supported LLM providers */
export type Provider = 'cerebras' | 'groq' | 'openai'

/** Provider configuration */
interface ProviderConfig {
  baseURL: string
  envKey: string
  models: string[] // Ordered best → worst, will rotate on rate limit
}

const PROVIDERS: Record<Provider, ProviderConfig> = {
  cerebras: {
    baseURL: 'https://api.cerebras.ai/v1',
    envKey: 'CEREBRAS_API_KEY',
    models: [
      'zai-glm-4.7', // Best quality, 100 req/day
      'qwen-3-235b-a22b-instruct-2507', // 235B, 1,440 req/day
      'gpt-oss-120b' // 120B, 14,400 req/day
    ]
  },
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    envKey: 'GROQ_API_KEY',
    models: [
      'openai/gpt-oss-120b' // Same 120B model
    ]
  },
  openai: {
    baseURL: 'https://api.openai.com/v1',
    envKey: 'OPENAI_API_KEY',
    models: ['gpt-4o-mini']
  }
}

// Track which model index to use per provider (rotates on rate limit)
const modelIndex = new Map<Provider, number>()

// Client cache per provider
const clients = new Map<Provider, OpenAI>()

/**
 * Get available providers (those with API keys set)
 */
export function getAvailableProviders(): Provider[] {
  return (Object.keys(PROVIDERS) as Provider[]).filter(
    (provider) => !!process.env[PROVIDERS[provider].envKey]
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
      throw new Error(`${config.envKey} environment variable not set`)
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
    throw new Error(
      'No LLM provider configured. Set CEREBRAS_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY'
    )
  }
  return available[0]
}

/**
 * Get current model for provider (with rotation support)
 */
function getCurrentModel(provider: Provider): string {
  const config = PROVIDERS[provider]
  const idx = modelIndex.get(provider) || 0
  return config.models[Math.min(idx, config.models.length - 1)]
}

/**
 * Rotate to next model for provider (called on rate limit)
 */
function rotateModel(provider: Provider): string | null {
  const config = PROVIDERS[provider]
  const currentIdx = modelIndex.get(provider) || 0
  const nextIdx = currentIdx + 1

  if (nextIdx >= config.models.length) {
    return null // No more models
  }

  modelIndex.set(provider, nextIdx)
  return config.models[nextIdx]
}

/** Chat options */
export interface ChatOptions {
  system?: string
  model?: string
  provider?: Provider
  fallback?: boolean // Try next provider on failure
}

/** Rate limit info from provider */
export interface RateLimitInfo {
  provider: Provider
  available: boolean
  error?: string
  limits?: {
    requestsPerMinute?: number
    requestsRemainingMinute?: number
    requestsPerDay?: number
    requestsRemainingDay?: number
    tokensPerMinute?: number
    tokensRemainingMinute?: number
    tokensPerDay?: number
    tokensRemainingDay?: number
  }
}

/**
 * Check rate limits for all available providers
 */
export async function checkProviderStatus(): Promise<RateLimitInfo[]> {
  const results: RateLimitInfo[] = []

  for (const provider of getAvailableProviders()) {
    try {
      const client = getClient(provider)
      const config = PROVIDERS[provider]

      // Make a minimal request to get headers (use first model)
      const response = await client.chat.completions
        .create({
          model: config.models[0],
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1
        })
        .asResponse()

      const h = response.headers
      const getInt = (name: string) => parseInt(h.get(name) || '0') || undefined

      results.push({
        provider,
        available: true,
        limits: {
          // Groq style (per minute)
          requestsPerMinute: getInt('x-ratelimit-limit-requests'),
          requestsRemainingMinute: getInt('x-ratelimit-remaining-requests'),
          tokensPerMinute: getInt('x-ratelimit-limit-tokens'),
          tokensRemainingMinute: getInt('x-ratelimit-remaining-tokens'),
          // Cerebras style (per day)
          requestsPerDay: getInt('x-ratelimit-limit-requests-day'),
          requestsRemainingDay: getInt('x-ratelimit-remaining-requests-day'),
          tokensPerDay: getInt('x-ratelimit-limit-tokens-day'),
          tokensRemainingDay: getInt('x-ratelimit-remaining-tokens-day')
        }
      })
    } catch (error) {
      results.push({
        provider,
        available: false,
        error: (error as Error).message
      })
    }
  }

  return results
}

/**
 * Check if error is a rate limit (429)
 */
function isRateLimitError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const status = (error as { status?: number }).status
    return status === 429
  }
  return false
}

/**
 * Chat with LLM (supports model rotation + provider fallback)
 *
 * Order: cerebras(zai-glm-4.7 → qwen-235b → gpt-oss-120b) → groq → openai
 */
export async function chat(prompt: string, options: ChatOptions = {}): Promise<string> {
  const { system, fallback = true } = options
  let { provider, model } = options

  // Get provider
  if (!provider) {
    provider = getDefaultProvider()
  }

  // Use specified model or current rotation model
  if (!model) {
    model = getCurrentModel(provider)
  }

  const messages: OpenAI.ChatCompletionMessageParam[] = []
  if (system) {
    messages.push({ role: 'system', content: system })
  }
  messages.push({ role: 'user', content: prompt })

  // Try current provider with model rotation
  let currentProvider = provider
  let currentModel = model

  while (true) {
    try {
      const response = await getClient(currentProvider).chat.completions.create({
        model: currentModel,
        messages
      })

      return response.choices[0]?.message?.content || ''
    } catch (error) {
      // On rate limit, try next model in same provider
      if (isRateLimitError(error)) {
        const nextModel = rotateModel(currentProvider)
        if (nextModel) {
          console.error(`Rate limited on ${currentModel}, rotating to ${nextModel}`)
          currentModel = nextModel
          continue
        }
      }

      // No more models in this provider, try next provider
      if (fallback) {
        const available = getAvailableProviders().filter((p) => p !== currentProvider)
        if (available.length > 0) {
          currentProvider = available[0]
          currentModel = getCurrentModel(currentProvider)
          console.error(`Falling back to ${currentProvider}/${currentModel}`)
          continue
        }
      }

      throw new Error(`LLM API error (${currentProvider}/${currentModel}): ${error}`)
    }
  }
}
