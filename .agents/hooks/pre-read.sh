#!/usr/bin/env bash

set -euo pipefail

case "/${1:-}/" in
  */.env.local/*)
    echo "Do not read .env.local; use Capy-managed environment variables." >&2
    exit 1
    ;;
  */node_modules/* | */.pnpm-store/* | */.pnpm/*)
    echo "Use pnpm opensrc path <package> instead of reading installed dependency source." >&2
    exit 1
    ;;
esac
