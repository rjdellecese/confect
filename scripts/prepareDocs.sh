#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 2 || ! "$1" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: bash scripts/prepareDocs.sh <main-commit-sha> <release-checkout>" >&2
  exit 1
fi

source_sha=$1
repository=$(git rev-parse --show-toplevel)
destination=$(realpath "$2")

if [[ "$destination" == "$repository" || "$(git -C "$destination" rev-parse --show-toplevel)" != "$destination" ]]; then
  echo "The destination must be a separate release checkout." >&2
  exit 1
fi
if [[ "$(git -C "$destination" branch --show-current)" != release || -n "$(git -C "$destination" status --porcelain --ignored)" ]]; then
  echo "The destination must be a clean release checkout, including ignored files." >&2
  exit 1
fi
if [[ "$(git cat-file -t "$source_sha")" != commit ]]; then
  echo "The source must be a commit SHA." >&2
  exit 1
fi
git merge-base --is-ancestor "$source_sha" refs/remotes/origin/main
git cat-file -e "${source_sha}:apps/docs/docs.json"
version=$(git show "${source_sha}:packages/core/package.json" | jq -er '.version')
if [[ ! "$version" =~ ^([1-9][0-9]*)\.[0-9]+\.[0-9]+$ || "${BASH_REMATCH[1]}" -lt 10 ]]; then
  echo "Only stable v10 or later documentation can be deployed." >&2
  exit 1
fi
published_sha=$(git rev-parse --verify "refs/tags/@confect/core@${version}^{commit}")
git merge-base --is-ancestor "$published_sha" "$source_sha"

entries=$(git ls-tree -r "$source_sha" -- apps/docs)
if printf '%s\n' "$entries" | grep -qvE '^100(644|755) blob '; then
  echo "Documentation must contain only regular tracked files." >&2
  exit 1
fi

archive=$(mktemp)
trap 'rm -f "$archive"' EXIT
git archive --format=tar "$source_sha" apps/docs > "$archive"
git -C "$destination" rm -r --ignore-unmatch -- .
tar -xf "$archive" -C "$destination"
git -C "$destination" add --all
printf 'Prepared documentation from %s\n' "$source_sha"
