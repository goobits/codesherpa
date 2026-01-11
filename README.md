# mcp-sherpa

MCP servers and Claude Code hooks for safer, smarter AI coding.

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/goobits/mcp-sherpa.git
cd mcp-sherpa
./install.sh

# 2. Set up your project
cd ~/your-project
sherpa init

# 3. Restart Claude Code
```

That's it! After restart, you'll have:

- **Hooks**: Block dangerous commands, manage large outputs
- **MCP**: AI-powered code review via Cerebras

## What Gets Configured

### Project Files Created

| File                          | Purpose                        |
| ----------------------------- | ------------------------------ |
| `.claude/settings.local.json` | Claude Code hooks              |
| `.claude/guard.json`          | Guard configuration            |
| `.mcp.json`                   | MCP server (cerebras-reviewer) |
| `.husky/pre-commit`           | Git pre-commit hooks           |
| `.lintstagedrc.json`          | Lint staged files              |

### Claude Code Hooks

Configured in `.claude/settings.local.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "sherpa pre" }] }
    ],
    "PostToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "sherpa post" }] }
    ]
  }
}
```

- **sherpa pre**: Blocks dangerous bash commands (rm -rf, curl|bash, etc.)
- **sherpa post**: Offloads large outputs to `.claude/scratch/`

### MCP Server

Configured in `.mcp.json`:

```json
{
  "mcpServers": {
    "cerebras-reviewer": {
      "type": "stdio",
      "command": "/path/to/node",
      "args": ["/path/to/reviewer/dist/index.js"]
    }
  }
}
```

Tools available:

- `review` - Review code, diffs, or prompts with line-number citations

Examples:

```
/review **/*.js
/review **/*.js --dry
/review --diff
/review --diff --base main --path packages/reviewer
/review --ask "How does the auth flow work?"
/review --ask "Summarize this repo" --dry
```

## Packages

| Package                    | Description                   |
| -------------------------- | ----------------------------- |
| `@goobits/sherpa`          | CLI and hooks for Claude Code |
| `@goobits/sherpa-core`     | Shared utilities              |
| `@goobits/sherpa-reviewer` | MCP server for AI code review |

## CLI Commands

```bash
sherpa init          # Set up repo (hooks, MCP, husky, lint-staged)
sherpa init --force  # Overwrite existing config
sherpa pre           # PreToolUse hook (blocks dangerous commands)
sherpa post          # PostToolUse hook (offloads large output)
sherpa daemon        # Start persistent daemon for faster responses
sherpa status        # Show LLM provider status
```

## Guard Config

Edit `.claude/guard.json`:

```json
{
  "maxTokens": 2000,
  "previewTokens": 500,
  "scratchDir": ".claude/scratch",
  "maxAgeMinutes": 60,
  "maxScratchSizeMB": 50
}
```

## Development

```bash
pnpm install
pnpm build
```

## Troubleshooting

### MCP server not connecting

1. Check `.mcp.json` has `"type": "stdio"`
2. Ensure paths are absolute
3. Restart Claude Code completely
4. Run `claude mcp list` to verify

### Hooks not working

1. Check `.claude/settings.local.json` format
2. Ensure `sherpa` is in PATH
3. Run `/doctor` in Claude Code

## License

MIT
