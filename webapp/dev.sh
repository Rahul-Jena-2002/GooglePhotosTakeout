#!/bin/bash
# dev.sh — Run the Astro dev server using the bundled Node 22 (no system npm needed)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE="$SCRIPT_DIR/node-v22.12.0-linux-x64/bin/node"
NPM="$SCRIPT_DIR/node-v22.12.0-linux-x64/lib/node_modules/npm/bin/npm-cli.js"

if [ ! -f "$NODE" ]; then
  echo "ERROR: Bundled Node not found at $NODE"
  echo "Extract it first: tar -xf node-v22.tar.xz"
  exit 1
fi

echo "Using Node: $($NODE --version)"
echo "Using npm:  $($NODE $NPM --version)"

# Install deps if node_modules/.bin is missing
if [ ! -d "$SCRIPT_DIR/node_modules/.bin" ]; then
  echo ""
  echo "Installing dependencies..."
  "$NODE" "$NPM" install --prefix "$SCRIPT_DIR"
fi

echo ""
echo "Starting dev server at http://localhost:4321"
"$NODE" "$NPM" run dev --prefix "$SCRIPT_DIR"
