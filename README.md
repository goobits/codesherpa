# mcp-sherpa

Monorepo for the sherpa CLI guard and the reviewer MCP server.

## Repository layout

- `packages/sherpa` - CLI (`sherpa`) and Claude Code hooks
- `packages/reviewer` - MCP server (`reviewer`)
- `packages/core` - shared utilities (LLM, git, file helpers)

## Use in another project

Sherpa supports **Claude Code**, **OpenAI Codex**, and **Google Gemini**.

```bash
cd ~/your-project
npx @goobits/sherpa init

echo "CEREBRAS_API_KEY=..." >> .env
echo "GROQ_API_KEY=..." >> .env
echo "OPENAI_API_KEY=..." >> .env
```

Restart your AI coding tool after init.

## CLI commands

```bash
sherpa init          # Set up repo (hooks, MCP, husky, lint-staged)
sherpa init --force  # Overwrite existing config
sherpa pre           # PreToolUse hook (blocks dangerous commands)
sherpa post          # PostToolUse hook (offloads large output)
sherpa reviewer      # Start MCP reviewer server (used by AI coding tools)
sherpa daemon        # Start persistent daemon for faster responses
sherpa status        # Show LLM provider status
```

## MCP server config (this repo)

`.mcp.json` is wired to the local build output:

```json
{
  "mcpServers": {
    "reviewer": {
      "type": "stdio",
      "command": "node",
      "args": ["./packages/reviewer/dist/index.js"]
    }
  }
}
```

## Development (this repo)

```bash
pnpm install
pnpm build
pnpm dev
pnpm typecheck
pnpm release     # Bump version and publish to npm
```

## Local install (this repo)

```bash
./install.sh           # installs to ~/.local/bin (no sudo)
./install.sh --system  # installs to /usr/local/bin (uses sudo if needed)
./install.sh --init    # install + run sherpa init in the current dir
```

## License

MIT
