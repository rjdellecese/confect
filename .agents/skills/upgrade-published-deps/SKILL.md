---
name: upgrade-published-deps
description: Upgrade dependencies on the published surface of the @confect/* packages (their dependencies/peerDependencies), adding a changeset only when consumers are affected
---

Upgrade the dependencies that consumers of the `@confect/*` packages can see,
and open a PR for review. Never merge it yourself.

## Scope

A package is published iff its `package.json` does not say `"private": true`—note that some private fixture workspaces also carry `@confect/*` names, so go
by the field, not the name. A dependency is in scope iff it appears in the
`dependencies` or `peerDependencies` of any published package, together with
its lockstep companions: packages that must match its version (e.g.
`react-dom` with `react`) and any `overrides` entry in `pnpm-workspace.yaml`
that pins one of its transitive dependencies (e.g. `@effect/typeclass` with
`effect`). Everything else is handled by the `upgrade-internal-deps` skill.

When bumping an in-scope dependency, update its development pins, dependency
ranges, and overrides across the workspace together; handle published peer
ranges under the policy below. Search the repo for the dependency's name
rather than enumerating locations from memory. Syncpack (`pnpm lint`) polices consistency
between `package.json` files, but **nothing lints the `overrides` block**, and
a stale override silently forces the old version at install time. After
bumping, confirm the new versions actually resolved (e.g. `pnpm why <dep>`).

## Rules

- Read the release notes/changelogs for each pending update before applying
  it. Treat minor bumps of `0.x` packages as potentially breaking, not routine.
- **Never attempt a major of a peer ecosystem** (effect, convex, react).
  Instead, summarize what's available, what it breaks, and a rough migration
  scope—in the PR description if this run opens one, otherwise in your final
  report (the no-PR rule below still applies).
- If a non-major upgrade snowballs into a real migration (API rewrites,
  behavioral changes beyond mechanical fixes), drop it from the batch and
  document it the same way.
- If the behavior of convex or the Confect CLI changed, re-run the server
  codegen scripts (`pnpm codegen:server:mock-backend`/`codegen:server:local-backend`) and commit the complete fixture output—check `git status` for newly generated files, since CI's codegen check only
  diffs tracked files.

## Dependency ranges and peer compatibility

- Preserve existing dependency range styles. Keep caret ranges for stable
  dependencies such as the CLI's `@effect/platform-node`; do not replace them
  with exact pins merely because they belong to the Effect ecosystem. Keep
  existing exact runtime pins, such as the server's AI dependencies, and keep
  `devDependencies` exactly pinned. Do not normalize these different roles
  into one version policy during a routine upgrade.
- Read the **published metadata for each selected dependency version**,
  including its `peerDependencies` (for example,
  `pnpm view @effect/platform-node@4.0.1 peerDependencies --json`). Account for
  relevant transitive peer requirements too. A dependency upgrade can raise
  the effective minimum Effect version even when Confect needs no code edits.
- Leave a published peer range alone unless Confect's code or required
  dependencies demand a higher minimum. When they do, make that minimum
  explicit in the affected package's peer range. For example, a CLI dependency
  requiring `effect: ^4.0.1` warrants raising the CLI's Effect peer floor from
  `^4.0.0` to `^4.0.1`. Do not raise unrelated packages' floors just to match
  development pins, and do not require every Effect package to have the same
  version number. Document a raised peer floor in a **minor changeset**, per
  the create-changeset skill, with the version consumers must install.
- Check peer compatibility without treating workspace overrides as evidence:
  our lockfile and overrides do not constrain consumers' installations.
  Consumers must satisfy the intersection of all applicable peer ranges;
  caret dependencies can resolve to later releases with higher peer floors.
  When changing a peer range, inspect the packed package manifests to confirm
  the published requirement, and call out the change in the PR description.

## Delivering

1. If nothing gets applied, say so and stop—no branch, no PR, even if
   deferred upgrades (e.g. a peer-ecosystem major) were spotted; the next
   scheduled run will surface them again.
2. Verify with the full repo checks (`pnpm check`, `pnpm test`, `pnpm build`)
   plus the server backend suites (`pnpm test:server:mock-backend` and
   `pnpm test:server:local-backend`). Anything the local environment genuinely
   can't run, leave to the PR's CI—and get it green. Drop upgrades that fail
   here before moving on.
3. Add a changeset iff the applied upgrade changes something consumers can
   observe: a published package's `dependencies` or `peerDependencies`, a
   consumer-facing range or override, shipped code, or runtime behavior. A
   `devDependencies`-only edit does not become user-facing merely because its
   `package.json` belongs to a published package; do not add a changeset for
   that alone. Follow the create-changeset skill when a changeset is required.
4. Push a branch (`deps/<short-description>`, unless this session was assigned
   a branch) and open a PR against `main`. In the body, list what was bumped
   with links to release notes, and note anything deliberately skipped and why.
