#!/usr/bin/env bash

set -euo pipefail

mapfile -d "" files < <(
  {
    git diff --name-only --diff-filter=ACMRT -z
    git ls-files --others --exclude-standard -z
  } | sort -zu
)

format_files=()
lint_files=()

for file in "${files[@]}"; do
  case "$file" in
    *.js | *.jsx | *.mjs | *.cjs | *.ts | *.tsx | *.mts | *.cts | *.json | *.jsonc | *.json5 | *.yaml | *.yml | *.toml | *.html | *.htm | *.vue | *.css | *.scss | *.less | *.md | *.mdx | *.graphql | *.gql | *.hbs)
      format_files+=("$file")
      ;;
  esac

  case "$file" in
    *.js | *.jsx | *.mjs | *.cjs | *.ts | *.tsx | *.mts | *.cts)
      lint_files+=("$file")
      ;;
  esac
done

if ((${#format_files[@]} > 0)); then
  mise exec -- pnpm oxfmt --write "${format_files[@]}" || true
fi

if ((${#lint_files[@]} > 0)); then
  mise exec -- pnpm oxlint --fix "${lint_files[@]}" || true
fi
