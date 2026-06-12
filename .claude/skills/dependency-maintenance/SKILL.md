---
name: dependency-maintenance
description: >-
  Procedures for upgrading dependencies across the Confect monorepo, designed
  to be run unattended by Claude Code Routines (weekly patch/minor maintenance,
  monthly majors and peer-floor verification) but equally usable in an
  interactive session. Use whenever upgrading dependencies, responding to
  `pnpm outdated` or `pnpm audit` findings, bumping the Effect or Convex
  ecosystems, or sweeping previously opened dependency PRs.
---

# Dependency maintenance

Two procedures live here: **WEEKLY** (patch/minor upgrades, security fixes, PR
sweeping) and **MONTHLY** (major upgrades, peer-floor verification). A routine
prompt tells you which one to run; in an interactive session, pick whichever
matches the task.

## Invariants (apply to every procedure)

These are hard rules. Everything not covered by them — especially how to group
upgrades into PRs — is your judgment call.

- **Never modify `peerDependencies` ranges** in the published `@confect/*`
  packages. Raising a peer lower bound is a deliberate, human-made API
  decision (it requires a minor changeset and release). If an upgrade seems to
  require it, stop that upgrade and flag it in the PR body or run report
  instead.
- **Never merge anything.** Open or update PRs; a human merges. Do not enable
  GitHub auto-merge on any PR.
- **Pins, ranges, and overrides move together.** Versions live in three
  places and must stay consistent: exact pins in each `package.json`
  (syncpack requires devDependencies be exact and identical across the
  workspace), the `overrides` block in `pnpm-workspace.yaml` (currently
  `convex`, `effect`, `@effect/typeclass`, `react`, `react-dom`), and prod
  dependency ranges in `packages/cli` and `apps/example`. When you bump a
  pinned version that also appears in `overrides`, bump the override too.
- **Lockstep groups.** These sets are interlocked upstream and must be
  upgraded together in one PR, never piecemeal:
  - *Effect ecosystem*: `effect` and every `@effect/*` package, plus the
    `effect` and `@effect/typeclass` overrides. The `@effect/*` packages are
    0.x, so **minor bumps are breaking** — read release notes. Note that
    `@effect/vitest` declares an exact `effect` peer version, so it must move
    in the same PR as `effect` itself.
  - *Convex ecosystem*: `convex` (and its override), `convex-test`,
    `convex-helpers`, `@convex-dev/*`. `convex-test` is 0.0.x — treat every
    bump as potentially breaking.
  - *React*: `react`, `react-dom` (and their overrides), `@types/react`,
    `@types/react-dom`.
- **Cooling period.** Skip any version published less than 3 days ago (check
  with `pnpm view <pkg> time --json`) — this is supply-chain protection, not
  caution about bugs. Exception: a version that fixes a `pnpm audit` finding
  may be taken immediately.
- **Branches and PRs.** Branch from `main` as `claude/deps/<topic>-<YYYY-MM-DD>`
  (e.g. `claude/deps/effect-2026-06-15`, `claude/deps/weekly-batch-2026-06-15`).
  Open at most 4 new PRs per run; prefer updating an existing open dependency
  PR over opening a near-duplicate. PR bodies must summarize what moved and
  why, link or quote notable changelog entries, and call out anything risky
  or skipped (and why).

## Verification ladder

Run after applying upgrades, in order, and fix what breaks before opening the
PR (source changes needed to absorb upstream API changes belong in the same
PR as the bump):

1. `pnpm install`
2. `pnpm lint` — includes syncpack, which enforces the pinning/consistency
   rules above; `pnpm lint:fix` and `pnpm format` resolve most violations
3. `pnpm typecheck`
4. `pnpm build`
5. `pnpm test`
6. `pnpm test:server:mock-backend`
7. `pnpm test:server:local-backend` — requires downloading the Convex local
   backend binary; if the environment can't fetch it, say so in the PR body
   so CI's run of it is understood to be the first real signal

If you cannot get a group green, don't abandon the run: open a **draft** PR
with the partial work and a clear description of where it's stuck, or drop
that group from the batch and note it in another PR's body.

## Changesets

All `@confect/*` packages version together (fixed group). Policy:

- devDependency and app (`apps/*`) upgrades: **no changeset**.
- Upgrades to `packages/cli`'s prod `dependencies` (e.g. `esbuild`,
  `@effect/cli`, `bundle-require`): **patch changeset** describing the bump.
- Anything touching peer ranges: forbidden here (see invariants).

## WEEKLY procedure

1. **Sweep existing dependency PRs.** List open PRs on `claude/deps/*`
   branches. For each: rebase onto `main` if behind or conflicted; if CI is
   red, diagnose and push a fix; if it has been superseded by `main` or by a
   newer PR, close it with a comment saying why. Don't open new work until
   the sweep is done.
2. **Security first.** Run `pnpm audit`. Any actionable advisory gets fixed
   in its own PR, exempt from the cooling period, opened before anything
   else.
3. **Survey.** Run `pnpm -r outdated`. Identify available patch and minor
   updates only — majors are out of scope (note them for the monthly run if
   they look significant). Apply the cooling period.
4. **Group by judgment.** Respect the lockstep groups; beyond that, decide
   grouping yourself. Sensible default: one PR per lockstep ecosystem that
   has updates, plus one batch PR for everything boring (types, toolchain,
   apps). Isolate anything you judge risky (large changelog, 0.x minor,
   build-output-affecting like `tsdown`/`typescript`) so it can't block the
   boring batch.
5. **Apply, verify, changeset, open PRs** per the sections above.
6. If nothing is actionable this week, do nothing — no empty PRs or noise.

## MONTHLY procedure

1. **Sweep** open `claude/deps/*` PRs exactly as in the weekly procedure.
2. **Majors.** From `pnpm -r outdated`, take available major upgrades, one PR
   per major (or per tightly coupled set — e.g. `vitest` +
   `@vitest/coverage-v8` + `vite` + `@effect/vitest` move together). For
   each: read the migration guide/changelog, apply the migration including
   any source changes, run the full verification ladder. If a major can't be
   completed, open a draft PR with findings and what remains, so the next
   run (or a human) can pick it up. If a major is blocked on an upstream
   dependency (e.g. a tool not yet supporting a new TypeScript major), skip
   it and record the blocker in the run report.
3. **Peer-floor verification.** The published packages claim wide peer ranges
   but CI only exercises the latest pins. Verify the floors still hold: in a
   throwaway worktree, set the `pnpm-workspace.yaml` overrides to the
   *lowest* versions allowed by the `@confect/*` peer ranges (read the
   current floors from the packages' `peerDependencies` — e.g. `convex`
   `^1.32.0` → `1.32.0`), `pnpm install`, then run `pnpm typecheck` and
   `pnpm test`. Discard the worktree afterwards — never commit floor pins.
   If the floors are broken, open an issue (or a draft PR demonstrating the
   failure) recommending a floor raise — do not raise it yourself.
