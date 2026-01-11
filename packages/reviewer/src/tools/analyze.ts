/**
 * cerebras_analyze tool - Architectural questions
 */

import { review } from './review.js';

export interface AnalyzeArgs {
	path: string;
	question: string;
}

export async function analyze(args: AnalyzeArgs): Promise<string> {
	return review({
		paths: args.path,
		question: args.question,
		focus: 'architecture',
	});
}

export const analyzeTool = {
	name: 'cerebras_analyze',
	description: 'Ask architectural questions about code',
	inputSchema: {
		type: 'object' as const,
		properties: {
			path: {
				type: 'string',
				description: 'Path to file or directory to analyze',
			},
			question: {
				type: 'string',
				description: 'The architectural question to answer',
			},
		},
		required: ['path', 'question'],
	},
};
