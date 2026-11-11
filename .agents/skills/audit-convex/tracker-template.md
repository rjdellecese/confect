# Convex audit issue and reference records

Use only the fields relevant to the record. Replace placeholders with verified
facts; do not paste this guidance into an issue or create a new umbrella tracker.
Capy Issues own actionable work and its lifecycle. The Captain maintains concise
Drive references, not another issue-status inventory. The Captain's Issues view
and concise conversation summaries are the front door.
GitHub #800 remains historical evidence only.
Keep detailed designs and execution logs in linked issues, PRs, or archival
comments rather than expanding these concise records.

## Actionable issue

Search existing issues and owner threads first. Create one issue per bounded
outcome, or update the existing issue without taking over another owner's work.
Use the organization's issue state and assignee fields, not a status in the title
or a second lifecycle vocabulary in its description.

- **Outcome:** consumer-visible gap or dependency-adoption blocker, affected
  modules, remaining subfeatures, and what would prove the work done.
- **Upstream contract:** API, package version or dated announcement, source link,
  context restrictions, and experimental/deprecated status where relevant.
- **Assessment:** Confect-specific equivalent and remaining gap, with permalinks
  at the inspected revision. Raw client/context access is interoperability, not
  parity. Mark imported claims `unassessed` until checked against current code or
  the upstream contract, and name the missing check; this is an evidence limit,
  not a second issue state.
- **Provenance:** source-qualified historical aliases and immutable evidence
  locators. CONF-85's `C1` and the 2026-10-16 audit's `C1` are different features.
  Deduplicate the work, not its source aliases; new findings use their issue code.
- **Scope or decision:** bounded next step, or the specific API, scope, or
  migration decision needed with prior discussion. Do not repeat an unchanged
  question. Link recorded decisions and preserve human notes.
- **Evidence and delivery:** linked owner thread and PR, implementation/test
  evidence, remaining verification, and publication evidence when relevant.
  Distinguish inspected test source from tests actually run.

For a compatibility blocker, include current/candidate package versions, the
failing check or constraint, a concrete prerequisite without weakening tests,
and an observable retry or resolution condition. Link related feature issues;
a successful upgrade does not establish feature parity. Preserve resolved
evidence in links rather than repeated logs.

An open PR is not support on `main`. Close a gap only after inspecting its merged
implementation and feature-specific evidence for every remaining subfeature.
A closed, unmerged PR neither resolves nor excludes the gap and must not be
recreated without a new user request. Record that constraint on the issue.
Verify the release tag or package contents before naming a published version;
otherwise say publication is unverified or, when established, not yet released.

## Captain reference

Keep only non-actionable checkpoints, decisions, and historical evidence here;
link issue codes for work instead of copying states, owners, or next-action lists.
Preserve evidence links before shortening a record, and re-read it before writing
to avoid overwriting another writer. The Captain owns these shared references.

- **Source checkpoint:** package/feed, exact successfully reviewed version or
  dated entry, versioned source link, inspected Confect branch/commit/date, and
  coverage limits. Advance only after review, never for unavailable sources.
  Do not change the inspection date just because a scheduled run found no change.
- **Historical crosswalk:** source audit and original upstream/repository
  versions, source-qualified aliases, immutable evidence locator, reconciliation
  date and limits, and destination issue or reference. Preserve the CONF-85
  inventory without copying stale implementation claims or daily status rows.
- **Decision or supported/excluded reference:** capability and context limits,
  Confect equivalent with implementation/test evidence on `main`, or explicit
  user decision or internal/non-API evidence and rationale for exclusion. Keep
  legacy document ID conversion and other approved exceptions visible even when
  native access remains available. Link remaining work rather than claiming
  partial support is complete.

Source review, an open PR, merged implementation, and verified publication are
different facts. Keep publication evidence separate from implementation evidence.
Conversation summaries link these records and actionable issues; they do not
reproduce the historical inventory or the reusable audit procedure.
