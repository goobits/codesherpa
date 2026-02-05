/**
 * sherpa review - AI-powered code review from the command line
 *
 * Usage:
 *   sherpa review [options]
 *
 * Modes:
 *   --mode files   Review code files (default)
 *   --mode diff    Review git changes
 *   --mode ask     Ask a question with custom prompt
 *
 * Options:
 *   --paths <glob>       File paths or glob pattern (files mode)
 *   --focus <type>       Review focus: general, security, performance, architecture, style
 *   --question <text>    Specific question to ask about the code
 *   --base <ref>         Git base ref for diff mode (default: HEAD~1)
 *   --path <dir>         Path filter for diff mode
 *   --prompt <text>      Custom prompt for ask mode
 *   --system <text>      System prompt override for ask mode
 *   --provider <name>    LLM provider: cerebras, groq, openai
 *   --dry-run            Show token estimate without calling LLM
 *   --json               Output as JSON
 *   --help               Show this help
 */

import type { Provider, ReviewArgs } from "@goobits/sherpa-core";

function showHelp(): void {
  console.log(`
sherpa review - AI-powered code review

Usage:
  sherpa review [options]

Modes:
  --mode files     Review code files (default)
  --mode diff      Review git changes
  --mode ask       Ask a question with custom prompt

Options:
  --paths <glob>       File paths, directory, or glob pattern (e.g., "**/*.ts")
                       Comma-separated for multiple paths
  --focus <type>       Review focus: general, security, performance, architecture, style
  --question <text>    Specific question to ask about the code
  --base <ref>         Git base ref for diff mode (default: HEAD~1)
  --path <dir>         Path filter for diff mode
  --prompt <text>      Custom prompt for ask mode
  --system <text>      System prompt override for ask mode
  --provider <name>    LLM provider: cerebras, groq, openai
  --dry-run            Show token estimate without calling LLM
  --json               Output as JSON
  -h, --help           Show this help

Examples:
  sherpa review --paths "src/**/*.ts" --focus security
  sherpa review --mode diff --base origin/main
  sherpa review --mode diff --base HEAD~3 --path src/
  sherpa review --mode ask --prompt "How would you refactor this code?"
  sherpa review --paths . --question "Are there any memory leaks?"
`);
}

function parseArgs(args: string[]): {
  options: ReviewArgs;
  json: boolean;
  help: boolean;
} {
  const options: ReviewArgs = {};
  let json = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case "--mode":
        if (next && ["files", "diff", "ask"].includes(next)) {
          options.mode = next as "files" | "diff" | "ask";
          i++;
        }
        break;
      case "--paths":
        if (next && !next.startsWith("--")) {
          options.paths = next;
          i++;
        }
        break;
      case "--focus":
        if (
          next &&
          [
            "general",
            "security",
            "performance",
            "architecture",
            "style",
          ].includes(next)
        ) {
          options.focus = next as ReviewArgs["focus"];
          i++;
        }
        break;
      case "--question":
        if (next && !next.startsWith("--")) {
          options.question = next;
          i++;
        }
        break;
      case "--base":
        if (next && !next.startsWith("--")) {
          options.base = next;
          i++;
        }
        break;
      case "--path":
        if (next && !next.startsWith("--")) {
          options.path = next;
          i++;
        }
        break;
      case "--prompt":
        if (next && !next.startsWith("--")) {
          options.prompt = next;
          i++;
        }
        break;
      case "--system":
        if (next && !next.startsWith("--")) {
          options.system = next;
          i++;
        }
        break;
      case "--provider":
        if (next && ["cerebras", "groq", "openai"].includes(next)) {
          options.provider = next as Provider;
          i++;
        }
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--json":
        json = true;
        break;
      case "-h":
      case "--help":
        help = true;
        break;
      default:
        // If first positional arg and no paths set, treat as paths
        if (!arg.startsWith("--") && !options.paths) {
          options.paths = arg;
        }
    }
  }

  return { options, json, help };
}

export async function runReview(): Promise<void> {
  const args = process.argv.slice(3); // Skip node, script, 'review'
  const { options, json, help } = parseArgs(args);

  if (help) {
    showHelp();
    return;
  }

  // Dynamic import to avoid loading heavy dependencies unless needed
  const { review } = await import("@goobits/sherpa-core");

  try {
    const result = await review(options);

    if (json) {
      console.log(JSON.stringify({ success: true, result }));
    } else {
      console.log(result);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) {
      console.log(JSON.stringify({ success: false, error: message }));
      process.exit(1);
    } else {
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  }
}
