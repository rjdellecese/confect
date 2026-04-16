---
name: opensrc
description: Fetch dependency source code to give AI agents deeper implementation context. Use when the agent needs to understand how a library works internally, read source code for a package, fetch implementation details for a dependency, or explore how an npm/PyPI/crates.io package is built. Triggers include "fetch source for", "read the source of", "how does X work internally", "get the implementation of", "opensrc path", or any task requiring access to dependency source code beyond types and docs.
---

# Source code with opensrc

The `opensrc` dev dependency resolves packages to git repositories, shallow-clones at the right tag, and caches source globally under `~/.opensrc/` (override with `OPENSRC_HOME`). Metadata is tracked in `~/.opensrc/sources.json`. This CLI does **not** write an `opensrc/` directory in the repo or modify `AGENTS.md`.

In this monorepo, invoke the CLI with **`pnpm exec opensrc`** from the workspace root (or `pnpm --dir /path/to/project exec opensrc` when resolving versions from another project).

## Core pattern

```bash
rg "parse" "$(pnpm exec opensrc path zod)"
cat "$(pnpm exec opensrc path zod)/src/types.ts"
find "$(pnpm exec opensrc path zod)" -name "*.test.ts"
```

`pnpm exec opensrc path <pkg>` prints the absolute path to cached source on stdout (stderr is progress). Subshells and `$(...)` work as shown.

## Fetching source

```bash
pnpm exec opensrc path zod
pnpm exec opensrc path pypi:requests
pnpm exec opensrc path crates:serde
pnpm exec opensrc path facebook/react

# Multiple packages
pnpm exec opensrc path zod react next
pnpm exec opensrc path pypi:requests pypi:flask
pnpm exec opensrc path crates:serde crates:tokio

# Specific versions
pnpm exec opensrc path zod@3.22.0
pnpm exec opensrc path pypi:flask@3.0.0
pnpm exec opensrc path owner/repo@v1.0.0
pnpm exec opensrc path owner/repo#main
```

### Version resolution

For npm packages, opensrc detects the installed version from lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`). Point at another project with `--cwd`:

```bash
pnpm exec opensrc path zod --cwd /path/to/project
```

For PyPI and crates.io, use an explicit version or latest. For repos, use `@ref` or `#ref` for a branch, tag, or commit.

## Managing the cache

```bash
pnpm exec opensrc list
pnpm exec opensrc list --json

pnpm exec opensrc remove zod
pnpm exec opensrc remove facebook/react

pnpm exec opensrc clean
pnpm exec opensrc clean --npm
pnpm exec opensrc clean --pypi
pnpm exec opensrc clean --crates
pnpm exec opensrc clean --packages
pnpm exec opensrc clean --repos
```

## When to fetch source

Fetch when you need implementation behavior that types or docs do not spell out (debugging, edge cases, internal patterns). Skip it for straightforward API questions answerable from documentation or signatures.
