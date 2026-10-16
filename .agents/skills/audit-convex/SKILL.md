---
name: audit-convex
description: Keep Confect compatible with stable Convex releases and audit new Convex features, implementing bounded additions and tracking unresolved gaps
---

# Audit Convex compatibility and features

Check both compatibility with new Convex releases and whether their new public
APIs have Confect equivalents. Equivalent Effect-based APIs count; requiring a
caller to use a raw Convex client or context is interoperability, not Confect API
parity. Preserve explicit user-approved exclusions, such as legacy document ID
conversion, rather than reopening them under the general parity goal.

The Capy automation runs daily at 04:00 America/New_York; its schedule and enabled
state live in Capy, not in this repository.

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
4. Read [tracker #800](https://github.com/rjdellecese/confect/issues/800), the
   canonical inventory for historical gaps and new releases. Maintain the format
   in [tracker-template.md](tracker-template.md), preserving human notes and
   decisions. If the issue cannot be read, report the access blocker rather than
   creating a competing tracker. Its source-review checkpoints record what was
   examined, not what has been implemented or published.
5. Preserve the imported CONF-85 inventory, its source evidence, explicit scope
   decisions, and existing work ownership. Historical IDs and the first release
   audit's IDs overlap: keep their source namespaces and aliases. Do not discard
   old gaps because they predate the release lookback or their dependency upgrade
   already merged. If an item was not reconciled against current code, mark it
   `unassessed` rather than copying a stale implementation claim.
6. Review releases and announcements since the successful checkpoints, and
   unresolved items whose code, upstream contract, linked work, or decision has
   changed. Do not re-audit every unchanged historical gap each day. Consider
   bounded, unowned backlog work under the implementation policy below, but do
   not start large historical features without a design decision. When no source
   checkpoint exists, review the pinned release, all newer stable releases, and
   the preceding 30 days of product updates, recording the limited coverage.
   Never mark unavailable sources as reviewed or advance their checkpoints.

## Assess features, not just versions

For each relevant addition, deprecation, or behavior change, record one of:

- **Already supported:** identify the Confect-specific API or equivalent Effect
  representation, its context restrictions, and relevant implementation/tests.
  Raw context/client access alone does not qualify. Add focused regression
  coverage when the current suite cannot prove the claim.
- **Needs Confect work:** identify the affected modules and consumer-visible gap.
  Implement compatible, bounded additions that follow established APIs, with
  tests and documentation. Propose work requiring an API-design decision,
  architectural migration, or a peer-ecosystem major rather than guessing.
- **Outside Confect's scope:** record an upstream internal API, non-API product
  change, or explicit user-approved exclusion with its source and rationale.
  Do not exclude a public API because native access works, existing tests pass,
  or implementation is inconvenient. Unsettled boundaries, including CLI scope
  and experimental/deprecated public APIs, need a decision rather than silent
  exclusion.

Keep deferred work in the tracker with its upstream version or announcement,
impact, proposed scope, and linked issue or PR. An open implementation PR means
pending, not supported on `main`. Close a gap only after inspecting the merged
implementation and its evidence; a closed, unmerged PR does not resolve it and
must not be recreated without a new user request. Do not repeatedly request a
decision already recorded in the tracker unless new evidence changes it. Record
the released version separately: a merge is not proof of npm publication. Partial
improvements do not close an entry with remaining subfeatures.

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
