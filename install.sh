#!/usr/bin/env bash
# Install mcp-sherpa globally
# Works on: macOS, Linux. For Windows, use WSL.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ORIGINAL_PWD="$(pwd)"

INIT_AFTER_INSTALL="false"
INIT_DIR=""

print_usage() {
	echo "Usage: ./install.sh [--init [path]] [--help]"
	echo ""
	echo "Options:"
	echo "  --init [path]   Run 'sherpa init' after install (default: current directory)"
	echo "  --help          Show this help message"
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --init)
            INIT_AFTER_INSTALL="true"
            shift
            if [ -n "${1:-}" ] && [ "${1#--}" = "$1" ]; then
                INIT_DIR="$1"
                shift
            fi
            ;;
        --help|-h)
            print_usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo ""
            print_usage
            exit 1
            ;;
    esac
done

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
echo "Stable (npm):"
echo "  npx @goobits/sherpa init"
echo ""
echo "Bleeding edge (this repo):"
echo "  ./install.sh --init"

if [ "$INIT_AFTER_INSTALL" = "true" ]; then
	TARGET_DIR="$ORIGINAL_PWD"
	if [ -n "$INIT_DIR" ]; then
		TARGET_DIR="$INIT_DIR"
    fi

    if [ ! -d "$TARGET_DIR" ]; then
        echo ""
        echo "Error: init path does not exist: $TARGET_DIR"
        exit 1
    fi

    echo ""
    echo "Running 'sherpa init' in: $TARGET_DIR"
    if ! (cd "$TARGET_DIR" && "$BIN_DIR/sherpa" init); then
        echo ""
        echo "Warning: 'sherpa init' failed. Re-run manually in your project."
    fi
else
    echo ""
    echo "Run 'sherpa init' in your project to set up Claude Code hooks."
fi
