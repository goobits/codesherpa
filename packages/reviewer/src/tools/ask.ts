/**
 * cerebras_ask tool - General purpose AI question
 */

import { chat } from '@goobits/sherpa-core'

import { ASK_SYSTEM } from '../prompts.js'

export interface AskArgs {
	prompt: string;
	system?: string;
}

export async function ask(args: AskArgs): Promise<string> {
	return chat(args.prompt, {
		system: args.system || ASK_SYSTEM
	})
}

export const askTool = {
	name: 'cerebras_ask',
	description: 'Ask Cerebras LLM a question',
	inputSchema: {
		type: 'object' as const,
		properties: {
			prompt: {
				type: 'string',
				description: 'The question to ask'
			},
			system: {
				type: 'string',
				description: 'Optional custom system prompt'
			}
		},
		required: [ 'prompt' ]
	}
}
