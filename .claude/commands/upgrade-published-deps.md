---
description: Upgrade dependencies on the published surface of the @confect/* packages (their dependencies/peerDependencies), with a changeset and a PR
---

Upgrade the dependencies that consumers of the `@confect/*` packages can see,
and open a PR for review. Never merge it yourself.

## Scope

A package is published iff its `package.json` does not say `"private": true` —
note that some private fixture workspaces also carry `@confect/*` names, so go
by the field, not the name. A dependency is in scope iff it appears in the
`dependencies` or `peerDependencies` of any published package, together with
its lockstep companions: packages that must match its version (e.g.
`react-dom` with `react`) and any `overrides` entry in `pnpm-workspace.yaml`
that pins one of its transitive dependencies (e.g. `@effect/typeclass` with
`effect`). Everything else is handled by `/upgrade-internal-deps`.

When bumping an in-scope dependency, move every occurrence across the
workspace together — search the repo for the dependency's name rather than
enumerating locations from memory. Syncpack (`pnpm lint`) polices consistency
between `package.json` files, but **nothing lints the `overrides` block**, and
a stale override silently forces the old version at install time. After
bumping, confirm the new versions actually resolved (e.g. `pnpm why <dep>`).

## Rules

- Read the release notes/changelogs for each pending update before applying
  it. Treat minor bumps of `0.x` packages (most of the `@effect/*` ecosystem,
  `convex-test`) as potentially breaking, not routine.
- **Never attempt a major of a peer ecosystem** (effect, convex, react).
  Instead, summarize what's available, what it breaks, and a rough migration
  scope — in the PR description if this run opens one, otherwise in your final
  report (the no-PR rule below still applies).
- If a non-major upgrade snowballs into a real migration (API rewrites,
  behavioral changes beyond mechanical fixes), drop it from the batch and
  document it the same way.
- Leave peer ranges alone unless the upgraded code actually requires raising a
  floor. Raising or widening a published range is a deliberate act that must
  be called out in the changeset.
- If the behavior of convex or the Confect CLI changed, re-run the server
  codegen scripts (`pnpm codegen:server:mock-backend` /
  `codegen:server:local-backend`) and commit the complete fixture output —
  check `git status` for newly generated files, since CI's codegen check only
  diffs tracked files.

## Delivering

1. If nothing gets applied, say so and stop — no branch, no PR, even if
   deferred upgrades (e.g. a peer-ecosystem major) were spotted; the next
   scheduled run will surface them again.
2. Verify with the full repo checks (`pnpm check`, `pnpm test`, `pnpm build`)
   plus the server backend suites (`pnpm test:server:mock-backend` and
   `pnpm test:server:local-backend`). Anything the local environment genuinely
   can't run, leave to the PR's CI — and get it green. Drop upgrades that fail
   here before moving on.
3. Add a changeset iff any published `package.json` changed — use the
   create-changeset agent.
4. Push a branch (`deps/<short-description>`, unless this session was assigned
   a branch) and open a PR against `main`. In the body, list what was bumped
   with links to release notes, and note anything deliberately skipped and why.
