#!/usr/bin/env bash

set -euo pipefail

file_path=${1:-}

if [[ ! -f "$file_path" ]]; then
  exit 0
fi

case "$file_path" in
  *.js | *.jsx | *.mjs | *.cjs | *.ts | *.tsx | *.mts | *.cts | *.json | *.jsonc | *.json5 | *.yaml | *.yml | *.toml | *.html | *.htm | *.vue | *.css | *.scss | *.less | *.md | *.mdx | *.graphql | *.gql | *.hbs)
    mise exec -- pnpm oxfmt --write "$file_path" || true
    ;;
esac

case "$file_path" in
  *.js | *.jsx | *.mjs | *.cjs | *.ts | *.tsx | *.mts | *.cts)
    mise exec -- pnpm oxlint --fix "$file_path" || true
    ;;
esac
