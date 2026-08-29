---
description: Upgrade internal-only dependencies (toolchain devDependencies and the private workspace packages' deps) and open a PR — no changeset
---

Upgrade the dependencies that consumers of the `@confect/*` packages can never
see, and open a PR for review. Never merge it yourself.

## Scope

Every `package.json` dependency that is **not** claimed by
`/upgrade-published-deps` (whose scope covers the published packages'
`dependencies`/`peerDependencies` plus their lockstep companions, such as
`react-dom` with `react`): the workspace's devDependencies (build/test/lint
toolchain, types) and the dependencies of every private workspace package —
the apps under `apps/*` and the server-test fixture workspaces. Skip
published-surface deps here even where they appear as devDependency pins,
since their pins move with their ranges.

## Rules

- Discover updates with `pnpm outdated -r` and bump to latest. Don't restate
  or hand-enforce the workspace's pinning conventions — apply the bumps, then
  run `pnpm lint:fix` (Syncpack) to normalize.
- Majors are fair game: attempt them, and if one requires more than mechanical
  changes to get green, drop it from the batch and explain what it would take
  in the PR description (or in your final report, if the run ends up applying
  nothing and opens no PR).
- Bumping `@effect/tsgo` also means updating
  `lsp.effect-tsgo.settings.package_version` in `.zed/settings.json` to the same
  version. That pins the copy of the binary Zed's `effect-tsgo` extension
  downloads, and it lives outside any dependency map, so `pnpm outdated` will
  never surface the drift. Also verify that the pinned `oxlint` and
  `oxlint-tsgolint` versions appear in that `@effect/tsgo` release's supported
  component table; the patch command rejects incompatible integrations. Left
  stale, the editor and CLI use different Effect language-service versions.
- These upgrades are not user-facing: **no changeset**.

## Delivering

1. If nothing gets applied, say so and stop — no branch, no PR, even if some
   upgrades were spotted and deferred; the next scheduled run will surface
   them again.
2. Verify with the full repo checks (`pnpm check`, `pnpm test`, `pnpm build`).
   Anything the local environment genuinely can't run, leave to the PR's CI —
   and get it green.
3. Push a branch (`deps/<short-description>`, unless this session was assigned
   a branch) and open a PR against `main`. In the body, list what was bumped
   and note anything deliberately skipped and why.
