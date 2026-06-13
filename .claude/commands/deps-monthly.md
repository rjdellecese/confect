---
description: Monthly dependency maintenance — major upgrades and peer-floor verification
---

Run the monthly dependency maintenance pass. First read the
`maintaining-dependencies` skill and follow its invariants, verification
ladder, and changeset policy throughout. Do not merge anything.

1. **Sweep open dependency PRs** exactly as the weekly pass does (rebase, fix
   red CI, close superseded ones) before opening new work.
2. **Majors.** From `pnpm -r outdated`, take the available major upgrades that
   clear the cooling period — one PR per major, or per tightly coupled set
   that must move together (see the skill on interlocked dependencies). For
   each: read the migration guide, apply the migration including any source
   changes, and run the full verification ladder. If a major can't be
   completed, open a **draft** PR with findings and what remains. If a major
   is blocked on an upstream dependency that doesn't support it yet, skip it
   and record the blocker in your report.
3. **Peer-floor verification.** Published packages claim wide peer ranges, but
   CI only exercises the latest pins, so the floors go untested. Verify them:
   in a throwaway git worktree, set the relevant `pnpm-workspace.yaml`
   overrides to the *lowest* versions the published packages' peer ranges
   allow (read those floors from the packages' `peerDependencies`), then
   `pnpm install` and run `pnpm typecheck` and `pnpm test`. Discard the
   worktree afterward — never commit floor pins. If a floor is broken, open an
   issue (or a draft PR demonstrating the failure) recommending it be raised;
   do not raise it yourself (that's a peer-range change — forbidden, per the
   skill).
