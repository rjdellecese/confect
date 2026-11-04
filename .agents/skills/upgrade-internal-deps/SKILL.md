---
name: upgrade-internal-deps
description: Upgrade internal-only dependencies (toolchain devDependencies and the private workspace packages' deps) and open a PR—no changeset
---

Upgrade the dependencies that consumers of the `@confect/*` packages can never
see, and open a PR for review. Never merge it yourself.

## Scope

Exclude `convex`, `convex-test`, `convex-helpers`, and `@convex-dev/*` packages
everywhere in the workspace, even when used only in private apps or fixtures.
The `audit-convex` skill owns their upgrades and feature assessments.

Every `package.json` dependency that is **not** claimed by
the `upgrade-published-deps` skill (whose scope covers the published packages'
`dependencies`/`peerDependencies` plus their lockstep companions, such as
`react-dom` with `react`): the workspace's devDependencies (build/test/lint
toolchain, types) and the dependencies of every private workspace package—the apps under `apps/*` and the server-test fixture workspaces. Skip
published-surface deps here even where they appear as devDependency pins,
since their pins move with their ranges.

## Rules

- Discover updates with `pnpm outdated -r` and bump to latest. Don't restate
  or hand-enforce the workspace's pinning conventions—apply the bumps, then
  run `pnpm lint:fix` (Syncpack) to normalize.
- Majors are fair game: attempt them, and if one requires more than mechanical
  changes to get green, drop it from the batch and explain what it would take
  in the PR description (or in your final report, if the run ends up applying
  nothing and opens no PR).
- Upgrade `@effect/tsgo`, `tsrs`, and `oxlint` as a compatible set from the
  Effect release's supported-component table. Lint and Zed launch through the
  workspace's `effect-tsgo` proxy, so no separate editor version pin is needed.
  The `prepare` script patches only `tsrs`, for compiler scripts, Vitest, and
  the native benchmark harness. Every Effect rule must stay enabled as an
  error, including newly introduced rules; `scripts/effectLint.test.ts` checks
  the installed schema against the configuration. Fix new findings and review
  any new export-specific unstable-API grants rather than disabling rules.
  Verify the native type-benchmark harness too; its patched
  dependency and baselines are documented in `tools/bench-harness/README.md`.
- These upgrades are not user-facing: **no changeset**.

## Delivering

1. If nothing gets applied, say so and stop—no branch, no PR, even if some
   upgrades were spotted and deferred; the next scheduled run will surface
   them again.
2. Verify with the full repo checks (`pnpm check`, `pnpm test`, `pnpm build`).
   Anything the local environment genuinely can't run, leave to the PR's CI—and get it green.
3. Push a branch (`deps/<short-description>`, unless this session was assigned
   a branch) and open a PR against `main`. In the body, list what was bumped
   and note anything deliberately skipped and why.
