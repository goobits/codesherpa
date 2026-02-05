# sherpa

AI-powered code review and safety tools for Claude Code.

```bash
npx @goobits/sherpa init
```

## Commands

| Command         | Description                                 |
| --------------- | ------------------------------------------- |
| `sherpa review` | AI code review (files, diffs, questions)    |
| `sherpa tree`   | Repository structure with stats             |
| `sherpa init`   | Set up hooks, MCP, husky, lint-staged       |
| `sherpa pre`    | PreToolUse hook (blocks dangerous commands) |
| `sherpa post`   | PostToolUse hook (manages large output)     |

## Review

```bash
sherpa review --paths "src/**/*.ts" --focus security
sherpa review --mode diff --base origin/main
sherpa review --mode ask --prompt "How would you refactor this?"
```

**Focus options:** `general` `security` `performance` `architecture` `style`

## Tree

```bash
sherpa tree --stats
sherpa tree --pattern "**/*.ts" --depth 4
sherpa tree --stats --summary    # includes AI summary
```

## Setup

```bash
npx @goobits/sherpa init
echo "CEREBRAS_API_KEY=..." >> .env
```

Restart Claude Code after init.

## Development

```bash
pnpm install && pnpm build
pnpm dev        # watch mode
pnpm typecheck
```

## Structure

```
packages/
  sherpa/    CLI and Claude Code hooks
  reviewer/  MCP server
  core/      Shared utilities (LLM, git, files)
```

## License

MIT
