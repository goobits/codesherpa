/**
 * LLM utilities: Cerebras API wrapper
 */

import OpenAI from 'openai';

const CEREBRAS_BASE_URL = 'https://api.cerebras.ai/v1';
const DEFAULT_MODEL = 'zai-glm-4.7';

let client: OpenAI | null = null;

/**
 * Get or create OpenAI client for Cerebras
 */
function getClient(): OpenAI {
	if (!client) {
		const apiKey = process.env.CEREBRAS_API_KEY;
		if (!apiKey) {
			throw new Error('CEREBRAS_API_KEY environment variable not set');
		}
		client = new OpenAI({
			apiKey,
			baseURL: CEREBRAS_BASE_URL,
		});
	}
	return client;
}

/**
 * Chat with Cerebras LLM
 */
export async function chat(
	prompt: string,
	options: {
		system?: string;
		model?: string;
	} = {}
): Promise<string> {
	const { system, model = DEFAULT_MODEL } = options;

	const messages: OpenAI.ChatCompletionMessageParam[] = [];
	if (system) {
		messages.push({ role: 'system', content: system });
	}
	messages.push({ role: 'user', content: prompt });

	try {
		const response = await getClient().chat.completions.create({
			model,
			messages,
		});

		return response.choices[0]?.message?.content || '';
	} catch (error) {
		throw new Error(`Cerebras API error: ${error}`);
	}
}
