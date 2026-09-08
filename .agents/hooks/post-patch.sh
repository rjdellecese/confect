#!/usr/bin/env bash

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

mapfile -d '' files < <(
  {
    git diff --name-only --diff-filter=ACMRT -z
    git diff --cached --name-only --diff-filter=ACMRT -z
    git ls-files --others --exclude-standard -z
  } | sort -zu
)

bash .agents/hooks/post-file.sh "${files[@]}"
