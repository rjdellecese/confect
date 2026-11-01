# Convex compatibility and feature tracker

Use these three sections in the canonical issue body. Replace placeholders with
verified facts; do not copy this guidance into the issue. Keep detailed designs
and execution logs in linked issues, PRs, or archival comments, not in the live
inventory. Preserve human decisions when reorganizing existing content.

## Audit coverage

- **Confect revision:** inspected branch, commit, and date.
- **Historical baseline:** source audit, original upstream/repository versions,
  reconciliation date, and coverage limits. Preserve the CONF-85 inventory.
- **Parity policy:** Confect-specific equivalents count; raw escape hatches do
  not. Record explicit exceptions with their decision source.

| Source                  | Successfully reviewed version or dated entry | Evidence                         | Coverage limit or next action            |
| ----------------------- | -------------------------------------------- | -------------------------------- | ---------------------------------------- |
| Package or product feed | Exact checkpoint                             | Versioned source or announcement | Unread source, deferred release, or none |

Source checkpoints advance only after review. They do not resolve feature gaps.
Do not change the inspection date merely because a scheduled run found no change.

## Feature inventory

Group rows by surface when useful. Keep an implemented row for traceability.
Use one canonical row for duplicate findings and preserve all original IDs as
aliases. CONF-85's `C1` and the 2026-10-16 audit's `C1` describe different features;
qualify inherited IDs with their source. Give new findings unique stable IDs.
Experimental/deprecated status and partial coverage belong in the feature text,
not in a second lifecycle-status vocabulary.

| ID / aliases               | Upstream API and source   | Confect equivalent or remaining gap             | Status           | Owner / issue / PR and next action               | Implementation / test evidence                                     | Released in                                       |
| -------------------------- | ------------------------- | ----------------------------------------------- | ---------------- | ------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------- |
| Source-qualified stable ID | API, version, source link | Consumer capability and any missing subfeatures | One status below | Existing owner and bounded next step or decision | Permalinks at the inspected revision; identify historical evidence | Verified version, not yet released, or unverified |

Use exactly one of these statuses:

- `unassessed`: imported evidence has not been checked against the relevant
  current code or upstream contract. State the missing check.
- `backlog`: a verified gap remains, without an implementation owner or unresolved
  scope decision. Partial support remains a gap.
- `needs decision`: identify the specific API, scope, or migration decision and
  its prior discussion. Do not repeatedly ask an unchanged question.
- `in progress`: link active implementation work and its owner. An open PR is not
  implementation on `main`; do not take over another thread's work.
- `implemented`: cite verified implementation and feature-specific evidence on
  `main`, accounting for every subfeature in the row. Keep npm release status
  separate and do not claim tests were run when only their source was inspected.
- `excluded with rationale`: cite the explicit user decision or evidence that
  the item is internal/non-API. A closed, unmerged PR does not itself authorize
  exclusion or recreation; retain the gap and record that a new request is needed.

For published support, verify the release tag or package contents before naming
a version. Use `unverified` when publication has not been checked. Keep explicit
user-approved exceptions visible even if native access remains available.

## Compatibility blockers

Keep dependency-adoption failures separate from missing Confect APIs. Link a
feature ID when related, but do not let a successful upgrade close that feature.

| ID        | Upgrade / affected versions            | Blocker and evidence                       | Prerequisite / owner / linked work   | Retry or resolution condition                         |
| --------- | -------------------------------------- | ------------------------------------------ | ------------------------------------ | ----------------------------------------------------- |
| Stable ID | Package and current/candidate versions | Failing check or constraint, with evidence | Concrete fix without weakening tests | Observable condition, not a daily repeat notification |

Retain resolved blocker references without repeating their logs. Preserve prior
evidence in links before shortening the body, and re-read the issue before
writing to avoid overwriting another writer's changes.
