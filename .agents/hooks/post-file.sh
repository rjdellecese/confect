#!/usr/bin/env bash

set -euo pipefail

format_files=()
lint_files=()

for file in "$@"; do
  if [[ ! -f "$file" ]]; then
    continue
  fi

  case "${file,,}" in
    *.js | *.jsx | *.mjs | *.cjs | *.ts | *.tsx | *.mts | *.cts | *.json | *.jsonc | *.json5 | *.yaml | *.yml | *.toml | *.html | *.htm | *.vue | *.css | *.scss | *.less | *.md | *.mdx | *.graphql | *.gql | *.hbs)
      format_files+=("$file")
      ;;
  esac

  case "${file,,}" in
    *.js | *.jsx | *.mjs | *.cjs | *.ts | *.tsx | *.mts | *.cts)
      lint_files+=("$file")
      ;;
  esac
done

status=0

if ((${#format_files[@]} > 0)); then
  mise exec -- pnpm oxfmt --write "${format_files[@]}" || status=$?
fi

if ((${#lint_files[@]} > 0)); then
  mise exec -- pnpm oxlint --fix "${lint_files[@]}" || status=$?
fi

exit "$status"
