#!/bin/bash
# dev.sh — Install dependencies and run webapp tasks on NTFS / normal filesystems.
# Works around `npm install --no-bin-links` (used to avoid NTFS symlink errors) by
# invoking tools through their direct .mjs/.js entry points instead of relying on
# the symlinks that live in node_modules/.bin/.
#
# Usage:
#   ./dev.sh                 # alias for `./dev.sh dev` — start the Astro dev server
#   ./dev.sh dev             # start the Astro dev server (binds 0.0.0.0)
#   ./dev.sh build           # generate sitemap + astro build
#   ./dev.sh preview         # astro preview (serves the built site locally)
#   ./dev.sh lint            # run eslint
#   ./dev.sh install         # reinstall node_modules (--no-bin-links)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 1. Determine which Node/npm to use.
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  echo "Using system Node: $(node --version)"
  echo "Using system npm:  $(npm --version)"
  NODE_CMD="node"
  NPM_CMD="npm"
elif [ -f "$SCRIPT_DIR/node-v22.12.0-linux-x64/bin/node" ]; then
  NODE_CMD="$SCRIPT_DIR/node-v22.12.0-linux-x64/bin/node"
  NPM_CMD="$NODE_CMD $SCRIPT_DIR/node-v22.12.0-linux-x64/lib/node_modules/npm/bin/npm-cli.js"
  echo "Using bundled Node: $($NODE_CMD --version)"
else
  echo "ERROR: Node/npm not found. Please install Node.js (e.g. sudo dnf install nodejs22 -y)"
  exit 1
fi

# 2. Direct entry-point paths (sidestep node_modules/.bin/ which is empty under
#    --no-bin-links installs).
ASTRO_ENTRY="$SCRIPT_DIR/node_modules/astro/bin/astro.mjs"
ESLINT_ENTRY="$SCRIPT_DIR/node_modules/eslint/bin/eslint.js"

# 3. Reusable install step.
do_install() {
  echo ""
  echo "Installing dependencies (with --no-bin-links for NTFS/FAT filesystem support)..."
  $NPM_CMD install --no-bin-links --prefix "$SCRIPT_DIR"
}

# 4. Subcommand dispatch. Default to `dev` for backwards compatibility.
CMD="${1:-dev}"
shift || true

case "$CMD" in
  install)
    do_install
    ;;

  dev)
    if [ ! -f "$ASTRO_ENTRY" ]; then
      echo "Astro is not installed. Running install first..."
      do_install
    fi
    echo ""
    echo "Starting dev server (Astro entry point)..."
    $NODE_CMD "$ASTRO_ENTRY" dev --host "$@"
    ;;

  build)
    if [ ! -f "$ASTRO_ENTRY" ]; then
      echo "Astro is not installed. Running install first..."
      do_install
    fi
    echo ""
    echo "Generating sitemap and building site..."
    $NODE_CMD "$SCRIPT_DIR/scripts/generate_sitemap.js" && $NODE_CMD "$ASTRO_ENTRY" build "$@"
    ;;

  preview)
    if [ ! -f "$ASTRO_ENTRY" ]; then
      echo "Astro is not installed. Running install first..."
      do_install
    fi
    echo ""
    echo "Starting preview server..."
    $NODE_CMD "$ASTRO_ENTRY" preview "$@"
    ;;

  lint)
    if [ ! -f "$ESLINT_ENTRY" ]; then
      echo "ESLint is not installed. Running install first..."
      do_install
    fi
    echo ""
    echo "Running ESLint..."
    $NODE_CMD "$ESLINT_ENTRY" "$@"
    ;;

  *)
    echo "Unknown command: $CMD"
    echo "Usage: $0 [dev|build|preview|lint|install]"
    exit 1
    ;;
esac
