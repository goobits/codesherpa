#!/usr/bin/env bash
# Install mcp-sherpa globally
# Works on: macOS, Linux. For Windows, use WSL.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ORIGINAL_PWD="$(pwd)"

INIT_AFTER_INSTALL="false"
INIT_DIR=""
SYSTEM_INSTALL="false"
BIN_DIR_OVERRIDE=""

print_usage() {
	echo "Usage: ./install.sh [--init [path]] [--system] [--bin-dir <path>] [--help]"
	echo ""
	echo "Options:"
	echo "  --init [path]   Run 'sherpa init' after install (default: current directory)"
	echo "  --system        Install to /usr/local/bin (uses sudo if needed)"
	echo "  --bin-dir       Install to a custom bin directory"
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
        --system)
            SYSTEM_INSTALL="true"
            shift
            ;;
        --bin-dir)
            if [ -z "${2:-}" ] || [ "${2#--}" != "$2" ]; then
                echo "Error: --bin-dir requires a path"
                exit 1
            fi
            BIN_DIR_OVERRIDE="$2"
            shift 2
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

if [ -n "$BIN_DIR_OVERRIDE" ]; then
    BIN_DIR="$BIN_DIR_OVERRIDE"
    mkdir -p "$BIN_DIR"
elif [ "$SYSTEM_INSTALL" = "true" ]; then
    BIN_DIR="/usr/local/bin"
    if [ -w "$BIN_DIR" ]; then
        :
    elif command -v sudo &> /dev/null; then
        USE_SUDO="sudo"
        echo "Using sudo to install to $BIN_DIR..."
    else
        echo "Error: $BIN_DIR is not writable and sudo is not available."
        exit 1
    fi
else
    BIN_DIR="$HOME/.local/bin"
    mkdir -p "$BIN_DIR"

fi

# Check if BIN_DIR is in PATH (POSIX-compatible)
case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *)
        echo ""
        echo "WARNING: $BIN_DIR is not in your PATH."
        echo "Add this to your shell config (~/.bashrc, ~/.zshrc, etc.):"
        echo "  export PATH=\"${BIN_DIR}:\$PATH\""
        echo ""
        ;;
esac

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
