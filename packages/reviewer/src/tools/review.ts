/**
 * cerebras_review tool - Code review with line citations
 */

import { statSync } from 'fs';
import { chat, findFiles, readFilesWithLimit, CODE_EXTENSIONS } from '@mcp/core';
import {
	CODE_REVIEW_SYSTEM,
	ARCHITECTURE_SYSTEM,
	FOCUS_INSTRUCTIONS,
} from '../prompts.js';

export interface ReviewArgs {
	paths: string;
	question?: string;
	focus?: 'general' | 'security' | 'performance' | 'architecture' | 'style';
}

export async function review(args: ReviewArgs): Promise<string> {
	const { paths, question, focus = 'general' } = args;

	// Parse paths (comma-separated)
	const pathList = paths.split(',').map((p) => p.trim());
	const filesToReview: string[] = [];

	for (const p of pathList) {
		// Check if glob pattern
		if (p.includes('*') || p.includes('?')) {
			const matched = await findFiles(p);
			filesToReview.push(...matched);
			continue;
		}

		try {
			const stat = statSync(p);
			if (stat.isFile()) {
				filesToReview.push(p);
			} else if (stat.isDirectory()) {
				// Get all code files in directory
				const pattern = `${p}/**/*`;
				const matched = await findFiles(pattern, { codeOnly: true });
				filesToReview.push(...matched);
			}
		} catch {
			return `Path not found: ${p}`;
		}
	}

	if (filesToReview.length === 0) {
		return 'No code files found to review.';
	}

	// Read files with size limit
	const { files, truncated } = readFilesWithLimit(filesToReview);

	let formattedContent = files.join('\n');
	if (truncated > 0) {
		formattedContent += `\n\n... truncated (${truncated} more files)`;
	}

	// Build prompt
	const focusText = FOCUS_INSTRUCTIONS[focus] || FOCUS_INSTRUCTIONS.general;
	const instruction = question
		? `${focusText}\n\nSpecific question: ${question}`
		: focusText;

	const prompt = `${instruction}

Review the following ${files.length} file(s). For each issue, cite the specific \`filename:line_number\`.

${formattedContent}`;

	// Choose system prompt
	const system = focus === 'architecture' ? ARCHITECTURE_SYSTEM : CODE_REVIEW_SYSTEM;

	return chat(prompt, { system });
}

export const reviewTool = {
	name: 'cerebras_review',
	description: 'Review code files with line-number citations',
	inputSchema: {
		type: 'object' as const,
		properties: {
			paths: {
				type: 'string',
				description:
					'File paths, directory, or glob pattern (e.g., "**/*.py"). Comma-separated for multiple.',
			},
			question: {
				type: 'string',
				description: 'Optional specific question to ask',
			},
			focus: {
				type: 'string',
				enum: ['general', 'security', 'performance', 'architecture', 'style'],
				description: 'Review focus (default: general)',
			},
		},
		required: ['paths'],
	},
};
