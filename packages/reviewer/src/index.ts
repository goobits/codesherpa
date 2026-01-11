#!/usr/bin/env node
/**
 * cerebras-reviewer MCP server
 *
 * Provides code review tools powered by Cerebras LLM
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { ask, askTool, type AskArgs } from './tools/ask.js';
import { review, reviewTool, type ReviewArgs } from './tools/review.js';
import { reviewDiff, diffTool, type DiffArgs } from './tools/diff.js';
import { analyze, analyzeTool, type AnalyzeArgs } from './tools/analyze.js';

// Create MCP server
const server = new Server(
	{
		name: 'cerebras-reviewer',
		version: '1.0.0',
	},
	{
		capabilities: {
			tools: {},
		},
	}
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: [askTool, reviewTool, diffTool, analyzeTool],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const { name, arguments: args } = request.params;

	try {
		let result: string;

		switch (name) {
			case 'cerebras_ask':
				result = await ask(args as unknown as AskArgs);
				break;
			case 'cerebras_review':
				result = await review(args as unknown as ReviewArgs);
				break;
			case 'cerebras_review_diff':
				result = await reviewDiff((args || {}) as unknown as DiffArgs);
				break;
			case 'cerebras_analyze':
				result = await analyze(args as unknown as AnalyzeArgs);
				break;
			default:
				throw new Error(`Unknown tool: ${name}`);
		}

		return {
			content: [{ type: 'text', text: result }],
		};
	} catch (error) {
		return {
			content: [
				{ type: 'text', text: `Error: ${(error as Error).message}` },
			],
			isError: true,
		};
	}
});

// Start server
async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error('cerebras-reviewer MCP server running on stdio');
}

main().catch(console.error);
