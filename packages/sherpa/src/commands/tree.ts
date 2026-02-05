/**
 * sherpa tree - Show repository tree structure
 */

import type { TreeArgs } from "@goobits/sherpa-core";

function showHelp(): void {
  console.log(`
sherpa tree - Show repository tree structure

Usage:
  sherpa tree [options]

Options:
  --pattern <glob>    Glob pattern to filter files (e.g., "**/*.ts")
  --depth <n>         Maximum depth to display (default: 3)
  --stats             Include file extension statistics
  --summary           Include AI-generated summary (uses LLM)
  --json              Output as JSON
  -h, --help          Show this help

Examples:
  sherpa tree                           # Show tree with default depth
  sherpa tree --depth 5                 # Show deeper tree
  sherpa tree --pattern "**/*.ts"       # Only TypeScript files
  sherpa tree --stats                   # Include file type counts
  sherpa tree --stats --summary         # Include AI summary
`);
}

function parseArgs(args: string[]): {
  options: TreeArgs;
  json: boolean;
  help: boolean;
} {
  const options: TreeArgs = {};
  let json = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case "--pattern":
        if (next && !next.startsWith("--")) {
          options.pattern = next;
          i++;
        }
        break;
      case "--depth":
        if (next && !next.startsWith("--")) {
          const depth = parseInt(next, 10);
          if (!isNaN(depth)) {
            options.depth = depth;
          }
          i++;
        }
        break;
      case "--stats":
        options.stats = true;
        break;
      case "--summary":
        options.summary = true;
        break;
      case "--json":
        json = true;
        break;
      case "-h":
      case "--help":
        help = true;
        break;
      default:
        if (!arg.startsWith("--") && !options.pattern) {
          options.pattern = arg;
        }
    }
  }

  return { options, json, help };
}

export async function runTree(): Promise<void> {
  const args = process.argv.slice(3);
  const { options, json, help } = parseArgs(args);

  if (help) {
    showHelp();
    return;
  }

  const { tree } = await import("@goobits/sherpa-core");

  try {
    const result = await tree(options);

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
