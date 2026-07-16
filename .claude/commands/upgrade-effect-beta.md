---
description: Bump the v10 prerelease branch to the latest Effect v4 beta and propagate main, migrating source as needed, with a changeset and a PR against v10
---

Keep the `v10` prerelease line on the latest Effect v4 beta and current with
`main`, and open a PR for review against `v10`. Never merge it yourself.
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
  so the eventual `v10` → `main` merge stays small. Every run also merges
  `origin/main` into the branch. No beta to bump **and**
  `git log origin/v10..origin/main` empty → say so and stop — no branch,
  no PR.
- **In-scope packages:** `effect` plus its lockstep companions from the
  effect monorepo already present in the workspace (`@effect/platform-node`,
  `@effect/platform-bun`, `@effect/vitest`) — all move to the same beta
  number together. Everything else, including `@effect/language-service`
  (which versions independently), belongs to the other upgrade commands.

## Rules

- Work on `deps/effect-v4-beta`, reset from `origin/v10` at the start of
  each run and pushed with `--force-with-lease`, so successive runs update
  the same open PR instead of stacking new ones. The PR targets `v10`,
  never `main`.
- Right after the reset, merge `origin/main` into the branch — a true merge,
  not a rebase or cherry-picks, so the histories stay converged for the
  eventual `v10` → `main` merge (see the managing-prereleases skill). Take
  `main`'s side of conflicts except where it would undo the prerelease
  line: keep `.changeset/pre.json`, `"baseBranch": "v10"` in
  `.changeset/config.json`, the `v10` entries in the workflow branch lists,
  the `X.0.0-next.N` versions and their changelog entries, and the Effect
  v4 pins (`main` is still on v3 — its Effect version bumps never apply
  here). Never hand-merge `pnpm-lock.yaml`; take either side and let
  `pnpm install` regenerate it. Changesets arriving with the merge ship
  as-is — don't fold them into this run's changeset.
- Bump every occurrence by searching the repo for the old beta string rather
  than enumerating locations from memory — that catches the
  `pnpm-workspace.yaml` `overrides` entry (which nothing lints, and a stale
  entry silently forces the old version at install time), the exact
  devDependency pins, and the `^4.0.0-beta.N` peer ranges. Raising the peer
  floor is deliberate and correct here: the source is compiled against the
  new beta's APIs. Then `pnpm install`, `pnpm lint:fix` (Syncpack) to
  normalize, and confirm the new version actually resolved with
  `pnpm why effect`.
- Read the effect changelogs for every beta between old and new **before**
  touching source, then migrate the Confect source to the new APIs until
  checks pass. Betas break APIs routinely; that migration is this command's
  job, not a reason to bail.
- If the migration genuinely can't be brought green with reasonable effort,
  stop: no branch, no PR. Report what's blocking and the rough scope — the
  next scheduled run will retry.
- If the convex codegen surface is affected, re-run the server codegen
  scripts (`pnpm codegen:server:mock-backend` /
  `codegen:server:local-backend`) and commit the complete fixture output —
  check `git status` for newly generated files, since CI's codegen check
  only diffs tracked files.

## Delivering

1. Verify with the full repo checks (`pnpm check`, `pnpm test`,
   `pnpm build`) plus the server backend suites
   (`pnpm test:server:mock-backend` and `pnpm test:server:local-backend`).
   Anything the local environment genuinely can't run, leave to the PR's
   CI — and get it green.
2. Add a changeset with the create-changeset agent — the published peer
   ranges changed, so this is user-facing. Use `patch`: the prerelease
   line's pending major changeset already governs the `X.0.0-next.N`
   version. State the new required beta and any consumer-visible
   consequences of the API changes. On a merge-only run (no beta bump),
   skip this step — the merged commits already carry their changesets.
3. Push `deps/effect-v4-beta` (unless this session was assigned a branch)
   and open a PR against `v10` — if a previous run's PR is still open,
   refresh its title and body for this run. In the body: old → new beta,
   links to the release notes covered, a summary of the source migrations
   made, and the `main` commits the merge brought in (or a note that `v10`
   already contained all of `main`).
