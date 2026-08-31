---
description: Bump the v10 prerelease branch to the latest Effect v4 release candidate, migrating source as needed, with a changeset and a PR against v10 or the active sync PR
---

Keep the `v10` prerelease line on the latest Effect v4 release candidate and
open a PR for review. Never merge it yourself. Routine propagation from
`main` belongs to the `sync-main-into-prerelease` skill; this workflow only
upgrades Effect and may stack on a sync that is already open.

A scheduled routine invokes this command by name, and the name is resolved
against this directory when the routine fires. Renaming this file therefore
means updating that schedule in the same pass.

## Scope

- **Target line:** `v10`. If it is gone, or
  `git show origin/v10:.changeset/pre.json` no longer says `"mode": "pre"`,
  the prerelease line has graduated: say so, stop, and suggest deleting this
  command and its routine.
- **Base:** look for one open PR against `v10` with the `prerelease-sync`
  label. If present, use its current head as the bump branch's starting point
  and PR base. Otherwise start from and target `origin/v10`. Do not create,
  refresh, or reproduce a `main` sync here.
- **Latest release candidate:** query `npm view effect@rc version` and compare
  it with `overrides.effect` in the selected base's
  `pnpm-workspace.yaml`. Do not use `effect@beta`; that tag stopped moving at
  `4.0.0-beta.107` when the RC line opened.
- **When Effect 4 is stable:** if `npm view effect version` is `4.x` while the
  `rc` tag has stopped moving, report that this RC-specific routine needs
  redesign before another run and stop. Choosing stable peer ranges is not an
  RC bump.
- **Packages:** `effect` and the lockstep Effect-monorepo companions already
  present in the workspace, including `@effect/platform-node`,
  `@effect/platform-bun`, and `@effect/vitest`. `@effect/tsgo` versions
  independently and is out of scope.

Already current means no work: report it and stop without a branch or PR.

## Upgrade

- Reset the reusable `deps/effect-v4-rc` branch from the selected base.
- Read the Effect changelogs for every release between the old and new pins
  before editing source. Treat RC APIs as stable but still verify every
  release for breakage.
- Search the entire repository for the old version string and update every
  occurrence. This includes `pnpm-workspace.yaml` overrides and
  `minimumReleaseAgeExclude`, exact development pins, and published peer
  ranges. Raising the peer floor is deliberate because Confect is compiled
  against the new RC.
- Run `pnpm install`, then `pnpm lint:fix` so Syncpack normalizes dependency
  metadata. Confirm the resolved version with `pnpm why effect`.
- Migrate Confect source until checks pass. If a migration genuinely cannot
  be made green, do not open or refresh the PR; report the blocker so the next
  scheduled run can retry.
- If the Convex codegen surface changed, run both server codegen scripts and
  commit all generated fixtures, including newly created files.

## Deliver

1. Follow the `create-changeset` skill and add a patch changeset stating the
   new required Effect release candidate and consumer-visible consequences.
2. Run `pnpm check`, `pnpm test`, `pnpm build`, and both server backend suites.
3. Push `deps/effect-v4-rc` with `--force-with-lease` so scheduled runs update
   the same PR.
4. Open or refresh the PR against the selected base. When stacked, explain
   that the `prerelease-sync` PR must merge first. Include old → new versions,
   release-note links, source migrations (or that none were needed), and
   validation. The PR never targets `main`.
