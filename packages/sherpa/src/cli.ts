#!/usr/bin/env node
/**
 * Sherpa CLI - unified entry point
 *
 * Usage:
 *   sherpa init     # Set up repo (husky, lint-staged, gitleaks, claude hooks)
 *   sherpa pre      # PreToolUse hook (blocks dangerous commands)
 *   sherpa post     # PostToolUse hook (offloads large output)
 *   sherpa review   # AI-powered code review
 *   sherpa tree     # Show repository tree structure
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { runInit } from "./commands/init.js";
import { runPost } from "./commands/post.js";
import { runPre } from "./commands/pre.js";
import { runReview } from "./commands/review.js";
import { runTree } from "./commands/tree.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
  try {
    const pkgPath = join(__dirname, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function showHelp(): void {
  console.log(`
sherpa - AI-powered code review and safety tools

Usage:
  sherpa review   AI-powered code review (files, diffs, or questions)
  sherpa tree     Show repository tree structure with optional stats
  sherpa init     Set up repo (husky, lint-staged, gitleaks, claude hooks)
  sherpa pre      PreToolUse hook (blocks dangerous commands)
  sherpa post     PostToolUse hook (offloads large output)
  sherpa reviewer Start MCP reviewer server (used by AI coding tools)
  sherpa daemon   Start persistent daemon for faster hook responses
  sherpa status   Show LLM provider status and rate limits

Options:
  --help, -h      Show this help message
  --version, -v   Show version

Examples:
  sherpa review --paths "src/**/*.ts" --focus security
  sherpa review --mode diff --base origin/main
  sherpa tree --stats --summary
  sherpa init              # First-time setup
  sherpa init --force      # Overwrite existing config
  sherpa reviewer          # Start MCP server (stdio)
  sherpa daemon &          # Start daemon in background
  sherpa status            # Check provider quotas

Run 'sherpa <command> --help' for detailed command options.
`);
}

const command = process.argv[2];

try {
  switch (command) {
    case "review":
      runReview();
      break;
    case "tree":
      runTree();
      break;
    case "init":
      runInit();
      break;
    case "pre":
      runPre();
      break;
    case "post":
      runPost();
      break;
    case "reviewer": {
      // Start the MCP reviewer server
      // The reviewer is bundled into dist/reviewer/index.js by esbuild
      import("child_process").then(({ spawn }) => {
        const reviewerPath = join(__dirname, "reviewer", "index.js");
        const child = spawn("node", [reviewerPath], {
          stdio: "inherit",
          env: process.env,
        });
        child.on("exit", (code) => process.exit(code ?? 0));
      });
      break;
    }
    case "daemon":
      // Dynamic import to avoid loading daemon code unless needed
      import("./daemon.js");
      break;
    case "status":
      // Dynamic import for status command
      import("./commands/status.js").then((m) => m.runStatus());
      break;
    case "--help":
    case "-h":
    case undefined:
      showHelp();
      break;
    case "--version":
    case "-v":
      console.log(getVersion());
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "sherpa --help" for usage');
      process.exit(1);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
}
