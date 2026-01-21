#!/usr/bin/env node
/**
 * reviewer MCP server
 *
 * Provides code review tools powered by Cerebras LLM
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { review, type ReviewArgs, reviewTool } from "./tools/review.js";
import { tree, type TreeArgs, treeTool } from "./tools/tree.js";

process.stdin.resume();

// Create MCP server
const server = new Server(
  {
    name: "reviewer",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [reviewTool, treeTool],
}));

function tokenizeArgs(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escape = false;

  for (const char of input) {
    if (escape) {
      current += char;
      escape = false;
      continue;
    }

    if (char === "\\") {
      escape = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function parseReviewArgs(args: unknown): ReviewArgs {
  if (typeof args !== "string") {
    return (args || {}) as ReviewArgs;
  }

  const tokens = tokenizeArgs(args);
  const parsed: ReviewArgs = { mode: "files" };
  const remaining: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    switch (token) {
      case "--dry":
      case "--dry-run":
        parsed.dryRun = true;
        break;
      case "--diff":
        parsed.mode = "diff";
        break;
      case "--ask":
        parsed.mode = "ask";
        break;
      case "--base":
        parsed.base = tokens[i + 1];
        i += 1;
        break;
      case "--path":
        parsed.path = tokens[i + 1];
        i += 1;
        break;
      case "--focus":
        parsed.focus = tokens[i + 1] as ReviewArgs["focus"];
        i += 1;
        break;
      case "--question":
        parsed.question = tokens[i + 1];
        i += 1;
        break;
      case "--system":
        parsed.system = tokens[i + 1];
        i += 1;
        break;
      case "--provider":
        parsed.provider = tokens[i + 1] as ReviewArgs["provider"];
        i += 1;
        break;
      case "--prompt":
        parsed.prompt = tokens[i + 1];
        i += 1;
        break;
      default:
        remaining.push(token);
        break;
    }
  }

  if (parsed.mode === "ask") {
    if (!parsed.prompt && remaining.length > 0) {
      parsed.prompt = remaining.join(" ");
    }
  } else if (parsed.mode === "diff") {
    if (!parsed.path && remaining.length > 0) {
      parsed.path = remaining.join(" ");
    }
  } else if (remaining.length > 0) {
    parsed.paths = remaining.join(",");
  }

  return parsed;
}

function parseTreeArgs(args: unknown): TreeArgs {
  if (typeof args !== "string") {
    return (args || {}) as TreeArgs;
  }

  const tokens = tokenizeArgs(args);
  const parsed: TreeArgs = {};
  const remaining: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    switch (token) {
      case "--summary":
        parsed.summary = true;
        break;
      case "--stats":
        parsed.stats = true;
        break;
      case "--depth":
        parsed.depth = Number.parseInt(tokens[i + 1] || "", 10);
        i += 1;
        break;
      default:
        remaining.push(token);
        break;
    }
  }

  if (remaining.length > 0) {
    parsed.pattern = remaining.join(" ");
  }

  return parsed;
}

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: string;

    switch (name) {
      case "review":
        result = await review(parseReviewArgs(args));
        break;
      case "tree":
        result = await tree(parseTreeArgs(args));
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: "text", text: result }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Note: No console output - it interferes with MCP protocol
}

main().catch(() => process.exit(1));
