---
description: Upgrade dependencies on the published surface of the @confect/* packages (their dependencies/peerDependencies), with a changeset and a PR
---

Upgrade the dependencies that consumers of the `@confect/*` packages can see,
and open a PR for review. Never merge it yourself.

## Scope

A dependency is in scope iff it appears in the `dependencies` or
`peerDependencies` of any published `@confect/*` package (the Effect and
Convex ecosystems, React, and the CLI's runtime deps). Everything else is
handled by `/upgrade-internal-deps`.

When bumping an in-scope dependency, move every occurrence across the
workspace together — the exact devDependency pins, the `overrides` block in
`pnpm-workspace.yaml`, and the private apps. Don't try to enumerate the
occurrences from memory; make the change, then let `pnpm lint` (Syncpack)
catch any that drifted.

## Rules

- Read the release notes/changelogs for each pending update before applying
  it. Treat minor bumps of `0.x` packages (most of the `@effect/*` ecosystem,
  `convex-test`) as potentially breaking, not routine.
- **Never attempt a major of a peer ecosystem** (effect, convex, react).
  Instead, summarize in the PR description what's available, what it breaks,
  and a rough migration scope.
- If a non-major upgrade snowballs into a real migration (API rewrites,
  behavioral changes beyond mechanical fixes), drop it from the batch and
  document it in the PR description the same way.
- Leave peer ranges alone unless the upgraded code actually requires raising a
  floor. Raising or widening a published range is a deliberate act that must
  be called out in the changeset.
- If the behavior of convex or the Confect CLI changed, re-run the server
  codegen scripts (`pnpm codegen:server:mock-backend` /
  `codegen:server:local-backend`) and commit the fixture output — CI fails on
  uncommitted codegen diffs.

## Delivering

1. If nothing gets applied, say so and stop — no branch, no PR, even if
   deferred upgrades (e.g. a peer-ecosystem major) were spotted; the next
   scheduled run will surface them again.
2. Add a changeset iff any published `package.json` changed — patch for the
   fixed group unless behavior warrants more. Follow the existing changelog
   convention of stating which upstream versions the new range was validated
   against.
3. Verify with the full repo checks (`pnpm check`, `pnpm test`, `pnpm build`)
   plus the server backend suites (`pnpm test:server:mock-backend` and
   `test:local-backend`). Anything the local environment genuinely can't run,
   leave to the PR's CI — and get it green.
4. Push a branch (`deps/<short-description>`, unless this session was assigned
   a branch) and open a PR against `main`. In the body, list what was bumped
   with links to release notes, and note anything deliberately skipped and why.
