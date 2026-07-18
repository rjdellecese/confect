---
description: Bump the v10 prerelease branch to the latest Effect v4 beta and propagate main, migrating source as needed, with changesets and stacked PRs against v10
---

Keep the `v10` prerelease line on the latest Effect v4 beta and current with
`main`, and open PRs for review against `v10`. Never merge them yourself.
(The managing-prereleases skill explains how the prerelease line itself
works.)

## Scope

- **Target branch:** `v10`. If it's gone, or
  `git show origin/v10:.changeset/pre.json` no longer says `"mode": "pre"`,
  the prerelease line has graduated: say so, stop, and suggest deleting this
  command and its routine — they only exist for the v10 cycle.
- **Latest beta:** effect publishes v4 betas under the npm `beta` dist-tag,
  so `npm view effect@beta version` is the lookup. Compare it against the
  branch's current pin (`overrides.effect` in
  `origin/v10:pnpm-workspace.yaml`). Already current → no bump to do, but
  still check for `main` changes to propagate before stopping.
- **Changes from `main`:** the prerelease line absorbs `main` continuously
  so the eventual `v10` → `main` merge stays small. Every run checks
  `git log origin/v10..origin/main`; when it's non-empty, the run
  propagates those commits in a dedicated sync PR (see Branches and PRs).
  No beta to bump **and** nothing to propagate → say so and stop — no
  branch, no PR.
- **In-scope packages:** `effect` plus its lockstep companions from the
  effect monorepo already present in the workspace (`@effect/platform-node`,
  `@effect/platform-bun`, `@effect/vitest`) — all move to the same beta
  number together. Everything else, including `@effect/language-service`
  (which versions independently), belongs to the other upgrade commands.

## Branches and PRs

A run produces up to two PRs, stacked when both are needed, so the merge is
reviewed as what it is and the bump PR's diff shows only the bump and its
migration:

- **Sync PR** — branch `sync/main-into-v10`, only when
  `git log origin/v10..origin/main` is non-empty. Reset from `origin/v10`
  at the start of the run, then merge `origin/main` into it per the merge
  rules below. The PR targets `v10`.
- **Bump PR** — branch `deps/effect-v4-beta`, only when there's a beta to
  bump. Reset from the tip of `sync/main-into-v10` when that branch is in
  play this run, otherwise from `origin/v10`. In the stacked case the PR
  targets `sync/main-into-v10` — merge the sync PR first, and when its
  branch is deleted GitHub retargets the bump PR to `v10` automatically —
  otherwise it targets `v10`.

Push both branches with `--force-with-lease` so successive runs update the
same open PRs instead of stacking new ones; refresh an existing PR's title,
body, and base branch to match the current run's shape. Neither PR ever
targets `main`.

## Rules

- The sync merge is a true merge of `origin/main`, not a rebase or
  cherry-picks, so the histories stay converged for the eventual
  `v10` → `main` merge (see the managing-prereleases skill). Take `main`'s
  side of conflicts except where it would undo the prerelease line: keep
  `.changeset/pre.json`, `"baseBranch": "v10"` in `.changeset/config.json`,
  the `v10` entries in the workflow branch lists, the `X.0.0-next.N`
  versions and their changelog entries, and the Effect v4 pins (`main` is
  still on v3 — its Effect version bumps never apply here). Never
  hand-merge `pnpm-lock.yaml`; take either side and let `pnpm install`
  regenerate it.
- Changes reaching `v10` through the merge fall into two cases for
  changelog purposes. Commits whose changesets are still pending on `main`
  (merged there but not yet released) arrive with their changeset files
  and ship as-is — don't fold or re-document them. Commits already
  released on `main` arrive with their changesets consumed, so nothing
  would mention them in the next `X.0.0-next.N` changelog entry — add a
  `patch` changeset on the sync branch naming the stable range absorbed,
  e.g. "Sync with `main`: this prerelease line now includes all changes
  released in `@confect/*` 9.3.2–9.4.0 — see those versions' changelog
  entries." Derive the range mechanically: compare the `@confect/*`
  version at `git merge-base origin/v10 origin/main` (computed before
  merging) with `main`'s current version. Equal versions → no released
  changes absorbed → skip this changeset.
- If code arriving from `main` doesn't compile against the branch's
  current Effect v4 pin (`main` is on v3), migrate it on the sync branch:
  the sync PR must be green at the current pin on its own, since it merges
  into `v10` before — and independently of — the bump.
- On the bump branch, bump every occurrence by searching the repo for the
  old beta string rather than enumerating locations from memory — that
  catches the `pnpm-workspace.yaml` `overrides` entry (which nothing
  lints, and a stale entry silently forces the old version at install
  time), the exact devDependency pins, and the `^4.0.0-beta.N` peer
  ranges. Raising the peer floor is deliberate and correct here: the
  source is compiled against the new beta's APIs. Then `pnpm install`,
  `pnpm lint:fix` (Syncpack) to normalize, and confirm the new version
  actually resolved with `pnpm why effect`.
- Read the effect changelogs for every beta between old and new **before**
  touching source, then migrate the Confect source to the new APIs until
  checks pass. Betas break APIs routinely; that migration is this
  command's job, not a reason to bail.
- If a migration genuinely can't be brought green with reasonable effort,
  stop that PR: a blocked sync means no branches and no PRs at all (the
  bump would build on a broken base); a blocked bump still delivers the
  sync PR on its own. Either way, report what's blocking and the rough
  scope — the next scheduled run will retry.
- If the convex codegen surface is affected, re-run the server codegen
  scripts (`pnpm codegen:server:mock-backend` /
  `codegen:server:local-backend`) and commit the complete fixture output —
  check `git status` for newly generated files, since CI's codegen check
  only diffs tracked files.

## Delivering

1. Verify with the full repo checks (`pnpm check`, `pnpm test`,
   `pnpm build`) plus the server backend suites
   (`pnpm test:server:mock-backend` and `pnpm test:server:local-backend`).
   In the stacked case, run them on the sync branch before building the
   bump on top, then again on the bump branch. Anything the local
   environment genuinely can't run, leave to the PRs' CI — and get it
   green.
2. Author the changesets with the create-changeset agent. The sync
   changeset (rules above) lives on the sync branch. The bump branch gets
   its own changeset — the published peer ranges changed, so this is
   user-facing. Use `patch` for both: the prerelease line's pending major
   changeset already governs the `X.0.0-next.N` version. The bump
   changeset states the new required beta and any consumer-visible
   consequences of the API changes.
3. Push the branches (unless this session was assigned a branch) and
   open or refresh the PRs per Branches and PRs. Sync PR body: the `main`
   commits brought in, the stable version range absorbed (matching the
   changeset), and any migrations needed to keep the merge green at the
   current pin. Bump PR body: old → new beta, links to the release notes
   covered, and a summary of the source migrations made.
