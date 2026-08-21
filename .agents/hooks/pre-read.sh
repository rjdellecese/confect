#!/usr/bin/env bash

set -euo pipefail

path=${1:-}

case "$path" in
  */.env.local | .env.local)
    echo "Do not read .env.local; use Capy-managed environment variables." >&2
    exit 1
    ;;
  *node_modules* | *.pnpm-store* | */.pnpm/*)
    echo "Use pnpm opensrc path <package> instead of reading installed dependency source." >&2
    exit 1
    ;;
esac
