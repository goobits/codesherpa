#!/usr/bin/env bash
# Install mcp-sherpa globally
# Works on: macOS, Linux. For Windows, use WSL.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing mcp-sherpa..."

# Check for pnpm
if ! command -v pnpm &> /dev/null; then
    echo "Error: pnpm is required. Install it with: npm install -g pnpm"
    exit 1
fi

# Build first
cd "$SCRIPT_DIR"
pnpm install
pnpm build

# Find a bin directory in PATH
USE_SUDO=""
BIN_DIR=""

# Try /usr/local/bin first (standard on macOS and Linux)
if [ -d "/usr/local/bin" ]; then
    if [ -w "/usr/local/bin" ]; then
        BIN_DIR="/usr/local/bin"
    elif command -v sudo &> /dev/null; then
        BIN_DIR="/usr/local/bin"
        USE_SUDO="sudo"
        echo "Using sudo to install to /usr/local/bin..."
    fi
fi

# Fallback to ~/.local/bin (XDG standard)
if [ -z "$BIN_DIR" ]; then
    BIN_DIR="$HOME/.local/bin"
    mkdir -p "$BIN_DIR"

    # Check if BIN_DIR is in PATH (POSIX-compatible)
    case ":$PATH:" in
        *":$BIN_DIR:"*) ;;
        *)
            echo ""
            echo "WARNING: $BIN_DIR is not in your PATH."
            echo "Add this to your shell config (~/.bashrc, ~/.zshrc, etc.):"
            echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
            echo ""
            ;;
    esac
fi

# Create wrapper scripts (more portable than symlinks)
$USE_SUDO tee "$BIN_DIR/sherpa" > /dev/null << EOF
#!/usr/bin/env bash
exec node "$SCRIPT_DIR/packages/sherpa/dist/cli.js" "\$@"
EOF
$USE_SUDO chmod +x "$BIN_DIR/sherpa"

$USE_SUDO tee "$BIN_DIR/reviewer" > /dev/null << EOF
#!/usr/bin/env bash
exec node "$SCRIPT_DIR/packages/reviewer/dist/index.js" "\$@"
EOF
$USE_SUDO chmod +x "$BIN_DIR/reviewer"

echo ""
echo "Installed:"
echo "  sherpa   -> $BIN_DIR/sherpa"
echo "  reviewer -> $BIN_DIR/reviewer"
echo ""
echo "Run 'sherpa init' in your project to set up Claude Code hooks."
