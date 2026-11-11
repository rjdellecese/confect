---
name: audit-convex
description: Audit Convex feature parity through Confect and Effect equivalents, implementing bounded additions and preserving compatibility with stable releases
---

# Audit Convex feature parity and compatibility

Prioritize public Convex API parity through Confect equivalents, with release
compatibility as a supporting concern. Equivalent Effect-based APIs count;
requiring a caller to use a raw Convex client or context is interoperability, not Confect API
parity. Preserve explicit user-approved exclusions, such as legacy document ID
conversion, rather than reopening them under the general parity goal.

The Convex Feature Parity Captain owns this workflow. The existing scheduler
coordinates through the Captain rather than starting an independent audit
writer. Do not create a competing scheduler or change automation configuration
as part of an audit.

## Scope and shared policy

Own `convex`, `convex-test`, `convex-helpers`, and the `@convex-dev/*` packages
already declared in this workspace. Discover their manifests, development pins,
peer ranges, overrides, and fixtures rather than relying on a fixed location
list. Do not add unused ecosystem packages or upgrade unrelated dependencies.
The general dependency upgrade skills delegate these packages to this skill.

Read `AGENTS.md`, `REVIEW.md`, and
[upgrade-published-deps](../upgrade-published-deps/SKILL.md) before editing. Apply
that skill's release-note, range, peer-compatibility, migration-limit,
verification, and changeset policies to this scope. This skill's feature audit
and quiet no-change behavior replace its dependency-only stopping rule.

## Ownership and records

Capy Issues are authoritative for actionable work: gaps, compatibility blockers,
decisions needed, and implementation follow-ups. Search existing issues and
linked work before creating one; use one issue per bounded outcome, not a giant
umbrella tracker. Read the `issues` skill and use the organization's current
issue states and assignments rather than maintaining a parallel status table.

The Captain's Drive holds concise source checkpoints, recorded decisions, and
historical evidence references. The Captain's Issues view and concise conversation
summaries are the user-facing front door, linking issues and evidence rather than
maintaining a separate status inventory. Keep reusable technical procedures in
this repository, not in Captain files. Use
[tracker-template.md](tracker-template.md) for concise issue and reference
records, preserving human notes and decisions.

[GitHub #800](https://github.com/rjdellecese/confect/issues/800) is historical
evidence only, not an ongoing audit destination. The approved migration replaces
its canonical-tracker role. The Captain owns reconciliation and retirement;
crew threads do not edit it or bulk-import its claims. Resume incomplete
migration before incremental release audits. If required issues or references
cannot be read, report the access blocker rather than creating a competing
record. Coordinate all assignments through the Captain, respect external owners,
and keep at most two implementation threads active without overlapping writers.

## Discover releases and resume unfinished work

1. Read the Captain's Issues view, relevant issues, migration references, and
   crew assignments first. Fetch fresh `main` and inspect existing open PRs and active
   audit runs before starting work. Reuse an appropriate open Convex PR; do not
   race its active author, mutate an unrelated dependency PR, or push to a merged or closed PR.
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
4. Read the Captain's source-review checkpoints and linked evidence. These
   record what was examined, not what has been implemented or published. During
   migration, reconcile historical #800 evidence through the Captain's existing
   crosswalk rather than treating its old statuses as current facts.
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

Keep deferred work in Capy Issues with its upstream version or announcement,
impact, proposed scope, and linked issue or PR. An open implementation PR means
pending, not supported on `main`. Close a gap only after inspecting the merged
implementation and its evidence; a closed, unmerged PR does not resolve it and
must not be recreated without a new user request. Do not repeatedly request a
decision already recorded in an issue or Captain reference unless new evidence
changes it. Record the released version separately: a merge is not proof of npm publication. Partial
improvements do not close an entry with remaining subfeatures.

## Implement and verify

Update compatible dependencies, pins, and overrides together and confirm the
versions actually resolved. Preserve peer floors unless code or dependencies
require a higher minimum; follow `create-changeset` for consumer-visible changes.
Treat `0.x` minor releases as potentially breaking. Defer ecosystem majors and
non-mechanical migrations with a concrete assessment.

For applied changes, run `pnpm check`, `pnpm test`, `pnpm build`,
`pnpm test:server:mock-backend`, `pnpm test:server:local-backend`, and
`pnpm test:js:local-backend`. Run the two local-backend suites sequentially
because they share ports. When Convex or CLI behavior changes, regenerate the
server's mock-backend fixtures and the shared local-backend fixtures with
`pnpm codegen:server:mock-backend` and `pnpm codegen:local-backend`, including
new untracked output. Verify affected features explicitly; green existing tests
alone are not feature-parity evidence. Follow through on the PR's CI, including
packed-consumer checks. Never claim unrun checks passed. If an upgrade fails
verification, remove it from the deliverable and retain the blocker in the
relevant issue instead of silently forgetting it. Keep dependency-adoption
blockers separate from missing Confect APIs, linking related issues; a successful
upgrade does not close a feature gap.

## Deliver without noise

- Use the project's PR creation tool for new PRs targeting `main`; use
  `writing-commit-messages` for commits and descriptions. Include release links,
  applied changes, feature dispositions, validation, and deferred work. Link the
  relevant issues and evidence. Keep unrelated feature projects out of a routine
  compatibility PR.
- Update the assigned issues when actionable findings, blockers, or delivery
  state change. Report evidence and source coverage to the Captain, who maintains
  checkpoints, decisions, and concise conversation summaries. Keep source review,
  an open PR, merged implementation on `main`, and verified npm publication distinct. Do not copy
  issue statuses into Drive, add daily heartbeat comments, or repeat unchanged
  blockers.
- Report a new PR, newly discovered gap, changed blocker, or decision needed.
  If nothing changed, create no branch or PR and end silently. If only the audit
  record changed with no actionable finding, update it without a notification.
- Never merge, enable auto-merge, publish packages, or deploy production.
