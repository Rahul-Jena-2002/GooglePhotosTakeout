#!/bin/bash
# dev.sh — Install dependencies and run dev server on NTFS / normal filesystems
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. Determine which Node/npm to use
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  echo "Using system Node: $(node --version)"
  echo "Using system npm:  $(npm --version)"
  NODE="node"
  NPM="npm"
elif [ -f "$SCRIPT_DIR/node-v22.12.0-linux-x64/bin/node" ]; then
  NODE="$SCRIPT_DIR/node-v22.12.0-linux-x64/bin/node"
  NPM_PATH="$SCRIPT_DIR/node-v22.12.0-linux-x64/lib/node_modules/npm/bin/npm-cli.js"
  echo "Using bundled Node: $($NODE --version)"
  NODE_CMD="$NODE"
  NPM_CMD="$NODE $NPM_PATH"
else
  echo "ERROR: Node/npm not found. Please install Node.js (e.g. sudo dnf install nodejs22 -y)"
  exit 1
fi

# Set command runners
if [ -z "$NODE_CMD" ]; then
  NODE_CMD="$NODE"
  NPM_CMD="$NPM"
fi

# 2. Run install with --no-bin-links to prevent NTFS symlink errors
echo ""
echo "Installing dependencies (with --no-bin-links for NTFS/FAT filesystem support)..."
$NPM_CMD install --no-bin-links --prefix "$SCRIPT_DIR"

# 3. Start Astro dev server directly via its entry script to bypass missing symlinks
echo ""
echo "Starting dev server directly via Astro entry point..."
$NODE_CMD "$SCRIPT_DIR/node_modules/astro/astro.js" dev --host
