# mcp-sherpa

MCP servers and Claude Code hooks for safer, smarter AI coding.

## Quick Start

```bash
npm install -g @goobits/sherpa
sherpa init
```

This sets up:
- Claude Code hooks (block dangerous commands, manage output size)
- Git pre-commit hooks (lint-staged + gitleaks secrets scanning)

## Packages

| Package | Description |
|---------|-------------|
| `@goobits/sherpa` | CLI and hooks for Claude Code |
| `@goobits/sherpa-core` | Shared utilities (files, git, llm, tokens) |
| `@goobits/sherpa-reviewer` | MCP server for AI code review |

## @goobits/sherpa

### CLI Commands

```bash
sherpa init     # Set up repo (husky, lint-staged, gitleaks, claude hooks)
sherpa pre      # PreToolUse hook (blocks dangerous commands)
sherpa post     # PostToolUse hook (offloads large output)
```

### What `sherpa init` Creates

```
.claude/
├── settings.local.json    # Claude Code hook config
└── guard.json             # Guard settings
.husky/
└── pre-commit             # lint-staged + gitleaks
.lintstagedrc.json         # Lint staged files config
```

### Claude Hooks

Configured automatically in `.claude/settings.local.json`:

```json
{
  "hooks": {
    "PreToolUse": [{ "matcher": "Bash", "command": "sherpa pre" }],
    "PostToolUse": [{ "matcher": "Bash", "command": "sherpa post" }]
  }
}
```

- **sherpa pre**: Blocks dangerous bash commands (rm -rf, curl|bash, etc.)
- **sherpa post**: Offloads large outputs to `.claude/scratch/` to prevent context bloat

### Guard Config

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

### Pre-commit Hooks

Runs on every git commit:
1. **lint-staged** - Lint/format only changed files
2. **gitleaks** - Scan for secrets (API keys, credentials)

Requires [gitleaks](https://github.com/gitleaks/gitleaks) installed separately.

## @goobits/sherpa-reviewer

MCP server for AI-powered code review via Cerebras.

```bash
# Review files
cerebras_review("src/", { focus: "security" })

# Review git diff
cerebras_review_diff("main")

# Ask questions
cerebras_ask("How does this function work?")
```

## Development

```bash
pnpm install
pnpm build
```

## License

MIT
