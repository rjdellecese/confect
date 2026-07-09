---
description: Upgrade the runtime version pins that live outside package.json dependency maps (Node, pnpm, bun) and open a PR
---

Upgrade the repo's pinned runtime versions and open a PR for review. Never
merge it yourself.

## Scope

Version pins that live outside `package.json` dependency maps: `.node-version`,
the `packageManager` field in the root `package.json`, and the tool versions in
`mise.toml`. CI and mise read these files directly, so updating them is the
whole change — do not touch workflow files (Dependabot owns GitHub Actions and
devcontainer versions).

## Rules

- Bump within each tool's current major line. Take a major line (a new Node
  LTS, a pnpm or bun major) only if the release notes show nothing that
  affects this repo and the checks stay green; otherwise file a GitHub issue
  describing the jump.
- **Never change `engines` floors** in the published packages — those are
  published-surface policy and belong to a deliberate, changeset-recorded
  decision, not this routine.

## Delivering

1. If everything is already current, say so and stop — no branch, no PR.
2. Verify by reinstalling with the new versions and running the full repo
   checks (`pnpm check`, `pnpm test`, `pnpm build`). Anything the local
   environment genuinely can't run, leave to the PR's CI — and get it green.
3. Push a branch (`deps/<short-description>`, unless this session was assigned
   a branch) and open a PR against `main`, noting in the body which pins moved
   and linking their release notes.
