---
description: Merge the current main tip into an active vN Changesets prerelease branch, preserving ancestry and changeset provenance even when main has unpublished, retracted, or no-changeset work
---

# Sync main into a prerelease branch

Keep an active `vN` prerelease line current with `main` without graduating it.
Open or refresh a PR against `vN`; never merge it and never merge `vN` into
`main` as part of this workflow.

This workflow owns routine `main` → `vN` propagation. Dependency-upgrade
workflows may stack on its open PR, but must not implement their own sync logic.

## Decide whether a sync is needed

1. Fetch both branches and confirm `.changeset/pre.json` on `origin/vN` says
   `"mode": "pre"`. Stop if the prerelease line has graduated.
2. Find an open PR against `vN` carrying the `prerelease-sync` label. Refresh
   that PR rather than opening a competitor. Otherwise use
   `sync/main-into-vN`.
3. A sync is needed whenever the current `origin/main` tip is not an ancestor
   of the proposed head. Tree equality is irrelevant: a content-equivalent
   merge still records the checkpoint that makes the next comparison sound.
4. If `origin/main` is already an ancestor and there is no stale sync PR to
   refresh, report that the line is current and stop.

The repository audit enforces the invariant:

```bash
node scripts/auditPrereleaseSync.mjs --main-ref origin/main --head-ref HEAD
```

## Build the sync

- Reset the reusable sync branch from the current `origin/vN`, then perform a
  real `git merge --no-ff origin/main`. Do not rebase, squash, or cherry-pick.
  The merge commit must retain the exact current `main` tip as a parent even
  when the resulting tree is unchanged.
- Take `main`'s side of conflicts except where that would undo prerelease-line
  state. Preserve `.changeset/pre.json`, `"baseBranch": "vN"`, workflow
  triggers for `vN`, `X.0.0-next.N` versions and changelogs, prerelease docs
  configuration, and deliberate next-major dependency pins. Never hand-merge
  `pnpm-lock.yaml`; take one side and regenerate it with `pnpm install`.
- Migrate incoming code when it does not compile against the prerelease line's
  dependencies. The sync PR must be independently green.
- Summarize effective content with `git diff origin/vN..HEAD`. Use Git history
  only to establish provenance, not to decide whether the merge commit is
  worth keeping.

## Reconcile changesets by ID

For every effective published-package change entering from `main`, identify
the originating changeset ID and inspect both pending files in `.changeset/`
and consumed prerelease files in `.changeset/pre/`. Classify it before looking
at version headings:

| Provenance                                                                        | Action on the sync                                                                                                                         |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Still pending on `main`, absent from `.changeset/pre/`                            | Carry the original changeset unchanged.                                                                                                    |
| Same ID already in `.changeset/pre/`                                              | It has already shipped on `vN`; do not add another changeset. If the merge reintroduces a root copy, remove only that duplicate root copy. |
| Released on `main` before the content reached `vN`, absent from `.changeset/pre/` | Add an adapted, specific patch changeset for the effective content entering `vN`.                                                          |
| Retracted on `main` before either line published it                               | Remove the carried pending file; no replacement is needed.                                                                                 |
| Retracted on `main` after the ID entered `.changeset/pre/`                        | Stop for explicit review. Never delete the consumed prerelease file; decide whether code and a corrective changeset must be reverted.      |
| No originating changeset and no published surface changed                         | Merge with no changeset. This includes tooling, internal dependencies, docs, and ancestry-only checkpoints.                                |
| No originating changeset but a published surface changed                          | Flag the originating PR and stop for review instead of hiding the omission behind a generic sync changeset.                                |

Stable changelog headings are only a presentation aid after provenance says an
adapted changeset is required. Use them to describe the released stable range,
not to infer whether the content is new to `vN`. A heading missing from the
prerelease changelog does not prove the underlying change is missing: it may
already have shipped under the original changeset ID.

Run the audit after reconciliation. It rejects duplicate IDs across the root
and `.changeset/pre/` as well as stale ancestry.

## Deliver

1. Run `pnpm install` when dependency metadata or the lockfile changed.
2. Run the full repository checks (`pnpm check`, `pnpm test`, `pnpm build`) and
   both server backend suites. If codegen surfaces changed, regenerate and
   commit all fixtures.
3. Push the reusable branch with `--force-with-lease`, preserving the lease
   from the ref fetched at the start of the run.
4. Open or refresh one PR against `vN`, add the `prerelease-sync` label, and
   describe the exact `main` commit recorded, effective content, changeset
   provenance decisions, conflict migrations, and validation. Keep an
   ancestry-only PR open for review even when its Files Changed tab is empty.
5. Verify the `Prerelease sync policy` and `Prerelease sync freshness` checks
   pass. CI audits the PR's actual head rather than GitHub's synthetic merge
   commit. Every later push to `main` places a failing freshness check on each
   open labeled sync PR, so the PR remains green only until `main` advances and
   then requires another refresh.
