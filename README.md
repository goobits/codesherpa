# mcp-sherpa

MCP servers and Claude Code hooks for safer, smarter AI coding.

## Packages

| Package | Description |
|---------|-------------|
| `@mcp/core` | Shared utilities (files, git, llm, tokens, hooks) |
| `@mcp/guard` | Pre/Post hooks for Claude Code |
| `@mcp/reviewer` | Code review tools powered by Cerebras |

## Quick Start

```bash
pnpm install
pnpm build
```

## @mcp/guard

Unified command guard with two hooks:

- **PreToolUse** (`guard-pre`): Blocks dangerous bash commands via AST analysis
- **PostToolUse** (`guard-post`): Offloads large outputs to scratch files

### Configuration

```json
// .claude/settings.local.json
{
  "hooks": {
    "PreToolUse": [{ "matcher": "Bash", "command": "guard-pre" }],
    "PostToolUse": [{ "matcher": "Bash", "command": "guard-post" }]
  }
}
```

### Rules

Edit `packages/guard/rules.json` to customize blocked/allowed commands.

### Config

Edit `packages/guard/config.json`:

```json
{
  "maxTokens": 2000,
  "previewTokens": 500,
  "scratchDir": ".claude/scratch",
  "maxAgeMinutes": 60
}
```

## @mcp/reviewer

MCP server for AI-powered code review.

```bash
# Review files
cerebras_review("src/", { focus: "security" })

# Review git diff
cerebras_review_diff("main")

# Ask questions
cerebras_ask("How does this function work?")
```

## License

MIT
