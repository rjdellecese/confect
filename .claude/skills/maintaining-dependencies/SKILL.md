---
name: maintaining-dependencies
description: >-
  Shared rules for upgrading dependencies across the Confect monorepo — the
  invariants, verification ladder, and changeset policy that the dependency
  upgrade workflows depend on. Use whenever upgrading dependencies, responding
  to `pnpm outdated` or `pnpm audit` findings, or sweeping previously opened
  dependency PRs, and as the reference invoked by the deps upgrade commands.
---

# Maintaining dependencies

The Confect monorepo's dependency upgrades run through two commands —
`/deps-weekly` (patch/minor upgrades, security fixes, PR sweeping) and
`/deps-monthly` (major upgrades and peer-floor verification), both intended to
be driven unattended by Claude Code Routines. This skill holds the rules they
share. Read it before acting on either workflow.

## Invariants

Hard rules. Everything they don't cover — especially how to split upgrades
into PRs — is your judgment call.

- **Never modify `peerDependencies` ranges in published packages.** Raising a
  peer lower bound is a deliberate, human-made API decision (it warrants a
  minor changeset and release). If an upgrade seems to require it, stop that
  upgrade and flag it instead of doing it.
- **Never merge anything.** Open or update PRs; a human merges. Do not enable
  GitHub auto-merge.
- **A version can live in several places, and they must stay consistent.** The
  same dependency may appear as an exact pin in package manifests, in the
  `overrides` block of `pnpm-workspace.yaml`, and as a range in a publishable
  package. Don't work from a memorized list of which is which — when you
  change a version, search the repo for every occurrence and update them
  together. Syncpack (run via `pnpm lint`) enforces cross-workspace
  consistency and will tell you what's out of sync.
- **Upgrade interlocked dependencies together, in one PR.** Some upgrades are
  only safe as a set. Discover these rather than assuming a fixed grouping:
  packages released together under one upstream scope or family usually
  require matching versions; a `@types/*` package tracks its runtime package;
  and any package whose dependency/peer constraint pins an *exact* version of
  another must move in the same PR as that other package. Treat `0.x`
  dependencies' minor bumps as potentially breaking and read their release
  notes.
- **Cooling period.** Skip any version published less than 3 days ago (check
  `pnpm view <pkg> time --json`) — supply-chain protection, not bug caution.
  Exception: a version that resolves a `pnpm audit` finding may be taken
  immediately.
- **Branches and PRs.** Branch from `main` as `claude/deps/<topic>-<date>`.
  Open at most 4 new PRs per run; update an existing open dependency PR rather
  than opening a near-duplicate. PR bodies summarize what moved and why, quote
  or link notable changelog entries, and call out anything risky or skipped
  (with the reason).

## Verification ladder

Run after applying upgrades, in order, and fix what breaks before opening the
PR — source changes needed to absorb an upstream API change belong in the same
PR as the bump:

1. `pnpm install`
2. `pnpm lint` (includes the syncpack consistency checks; `pnpm lint:fix` and
   `pnpm format` resolve most violations)
3. `pnpm typecheck`
4. `pnpm build`
5. `pnpm test`
6. `pnpm test:server:mock-backend`
7. `pnpm test:server:local-backend` (downloads the Convex local-backend
   binary; if the environment can't fetch it, say so in the PR body so CI's
   run is understood to be the first real signal)

If you can't get a group green, don't abandon the run: open a **draft** PR with
the partial work and a clear note of where it's stuck, or drop that group from
the batch and record it in another PR's body.

## Changeset policy

All `@confect/*` packages version together (fixed group).

- devDependency and `apps/*` upgrades: **no changeset**.
- Upgrades to a published package's prod `dependencies`: **patch changeset**
  describing the bump.
- Anything touching peer ranges: forbidden here (see invariants).
