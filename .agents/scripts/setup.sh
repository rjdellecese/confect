#!/usr/bin/env bash

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

mise trust mise.toml
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm build
