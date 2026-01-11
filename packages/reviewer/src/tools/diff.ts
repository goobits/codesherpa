/**
 * cerebras_review_diff tool - Git diff review
 */

import { chat, getDiff } from '@goobits/sherpa-core'

import { DIFF_REVIEW_SYSTEM } from '../prompts.js'

export interface DiffArgs {
	base?: string;
	path?: string;
}

export async function reviewDiff(args: DiffArgs): Promise<string> {
	const { base = 'HEAD~1', path } = args

	try {
		const diff = await getDiff(base, path)

		if (!diff.trim()) {
			return 'No changes found.'
		}

		const prompt = `Review this diff:\n\n\`\`\`diff\n${ diff }\n\`\`\``
		return chat(prompt, { system: DIFF_REVIEW_SYSTEM })
	} catch(error) {
		return `Git error: ${ (error as Error).message }`
	}
}

export const diffTool = {
	name: 'cerebras_review_diff',
	description: 'Review git changes with Cerebras',
	inputSchema: {
		type: 'object' as const,
		properties: {
			base: {
				type: 'string',
				description: 'Base commit/branch to diff against (default: HEAD~1)'
			},
			path: {
				type: 'string',
				description: 'Optional path filter for the diff'
			}
		},
		required: []
	}
}
