---
name: audit-convex
description: Keep Confect compatible with stable Convex releases and audit new Convex features, implementing bounded additions and tracking unresolved gaps
---

# Audit Convex compatibility and features

Keep Confect current with Convex without equating a dependency bump with feature
support. The Capy automation runs daily at 04:00 America/New_York; its schedule
and enabled state live in Capy, not in this repository.

## Scope and shared policy

Own `convex`, `convex-test`, `convex-helpers`, and the `@convex-dev/*` packages
already declared in this workspace. Discover their manifests, development pins,
peer ranges, overrides, and fixtures rather than relying on a fixed location
list. Do not add unused ecosystem packages or upgrade unrelated dependencies.
The general dependency upgrade skills delegate these packages to this skill.

Read `AGENTS.md`, `REVIEW.md`, and `upgrade-published-deps` before editing. Apply
that skill's release-note, range, peer-compatibility, migration-limit,
verification, and changeset policies to this scope. This skill's feature audit
and quiet no-change behavior replace its dependency-only stopping rule.

## Discover releases and resume unfinished work

1. Fetch fresh `main` and inspect existing open PRs and active audit runs before
   starting work. Reuse an appropriate open Convex PR; do not race its active
   author, mutate an unrelated dependency PR, or push to a merged or closed PR.
   If another run owns the same work, leave it to that run rather than duplicate
   it. Check the PR's state again before pushing.
2. Read npm metadata for stable releases of the in-scope packages, including
   publication times and peer requirements. Skip prerelease versions and respect
   the repository's release-age policy. A changelog's unreleased section is not
   evidence that a version is published.
3. Read the [SDK changelog](https://github.com/get-convex/convex-js/blob/main/CHANGELOG.md),
   each updated companion package's release notes, and
   [Convex product updates](https://ship.convex.dev/). Follow relevant official
   documentation links. Backend features can ship without an npm version change,
   so do not stop just because dependency pins are current.
4. Find the repository issue titled **Convex compatibility and feature tracker**,
   including closed issues, before creating one. Reuse it as the audit record;
   preserve human notes. Record the last successfully reviewed versions and
   dated product updates, evidence links, and unresolved gaps. On the first run,
   review all releases newer than the workspace pins, the currently pinned
   releases' features, and product updates from the preceding 30 days. Record
   that baseline explicitly; it is not a claim of complete historical parity.
5. On subsequent runs, review new releases and announcements plus unresolved
   gaps, even if their dependency upgrade already merged. Do not mark unavailable
   sources as reviewed or advance their checkpoints. Report missing access as a
   blocker, not as proof that nothing changed.

## Assess features, not just versions

For each relevant addition, deprecation, or behavior change, record one of:

- **Already supported:** show how a Confect user reaches it, citing the wrapper,
  pass-through API, codegen output, or documentation and relevant tests. Add
  focused regression coverage when the current suite cannot prove the claim.
- **Needs Confect work:** identify the affected modules and consumer-visible gap.
  Implement compatible, bounded additions that follow established APIs, with
  tests and documentation. Propose work requiring an API-design decision,
  architectural migration, or a peer-ecosystem major rather than guessing.
- **Outside Confect's scope:** explain why the upstream capability needs no
  Confect change, with a source link. Do not label a missing wrapper irrelevant
  merely because existing tests pass.

Keep deferred work in the tracker with its upstream version or announcement,
impact, proposed scope, and linked issue or PR. An open implementation PR means
pending, not supported on `main`. Close a gap only after inspecting the merged
implementation and its evidence; a closed, unmerged PR does not resolve it and
must not be recreated without a new user request. Do not repeatedly request a
decision already recorded in the tracker unless new evidence changes it.

## Implement and verify

Update compatible dependencies, pins, and overrides together and confirm the
versions actually resolved. Preserve peer floors unless code or dependencies
require a higher minimum; follow `create-changeset` for consumer-visible changes.
Treat `0.x` minor releases as potentially breaking. Defer ecosystem majors and
non-mechanical migrations with a concrete assessment.

For applied changes, run `pnpm check`, `pnpm test`, `pnpm build`,
`pnpm test:server:mock-backend`, and `pnpm test:server:local-backend`. Regenerate
both server codegen fixtures when Convex or CLI behavior changes, including new
untracked output. Verify affected features explicitly; green existing tests
alone are not feature-parity evidence. Follow through on the PR's CI, including
packed-consumer checks. Never claim unrun checks passed. If an upgrade fails
verification, remove it from the deliverable and retain the blocker in the
tracker instead of silently forgetting it.

## Deliver without noise

- Use the project's PR creation tool for new PRs targeting `main`; use
  `writing-commit-messages` for commits and descriptions. Include release links,
  applied changes, feature dispositions, validation, and deferred work. Link the
  tracker. Keep unrelated feature projects out of a routine compatibility PR.
- Update the tracker only when reviewed source checkpoints, findings, evidence,
  decisions, or delivery state change. Keep source-review checkpoints separate
  from implementation status. Do not add daily heartbeat comments or repeat
  unchanged blockers.
- Report a new PR, newly discovered gap, changed blocker, or decision needed.
  If nothing changed, create no branch or PR and end silently. If only the audit
  record changed with no actionable finding, update it without a notification.
- Never merge, enable auto-merge, publish packages, or deploy production.
