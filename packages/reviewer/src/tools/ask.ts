/**
 * cerebras_ask tool - General purpose AI question
 */

import { chat, type Provider } from '@goobits/sherpa-core'

import { ASK_SYSTEM } from '../prompts.js'

export interface AskArgs {
	prompt: string;
	system?: string | null;
	provider?: Provider | null;
}

export async function ask(args: AskArgs): Promise<string> {
	return chat(args.prompt, {
		system: args.system || ASK_SYSTEM,
		provider: args.provider || undefined
	})
}

export const askTool = {
	name: 'cerebras_ask',
	description: 'Ask Cerebras GLM-4.7 a question.',
	inputSchema: {
		type: 'object' as const,
		properties: {
			prompt: {
				type: 'string'
			},
			system: {
				type: 'string',
				default: null
			}
		},
		required: [ 'prompt' ]
	}
}
