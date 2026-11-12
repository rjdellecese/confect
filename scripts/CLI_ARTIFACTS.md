# CLI report artifact selection

The Packages workflow uploads one `cli-results-<os>-<shard>-attempt-<n>` artifact
per CLI execution. Reports select eight artifacts before downloading anything;
they never merge all artifacts matching a name pattern. Failed executions remain
in GitHub's job history and artifact storage until normal retention expires.

## Why attempts alone are insufficient

GitHub supports [partial reruns](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs).
In [run 43137770636](https://github.com/rjdellecese/confect/actions/runs/43137770636),
the attempt-specific jobs API copied unaffected jobs into subsequent snapshots
with new job IDs and `run_attempt` values but their original execution timestamps.
Ubuntu shard 1 retained `01:55:13–01:56:03` in all three attempts. Windows shard 1
moved from `01:55:13–01:57:21` to `02:00:35–02:03:07` on its successful rerun,
then retained that window when only the report reran.

The failed artifact's ID was larger than the passing artifact's ID. Neither IDs,
list order, nor the snapshot's attempt number identifies the artifact to replay.
The [artifact API](https://docs.github.com/en/rest/actions/artifacts#list-workflow-run-artifacts)
does not expose a job ID or run-attempt field.

## Selection and validation

`cliArtifacts.ts select` consumes all pages from the
[jobs endpoint for the report's specific attempt](https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt)
and the run's artifacts. For each OS/shard, it requires one completed, successful
job with the expected run ID, API head SHA and snapshot attempt. For pull requests,
this head SHA is the PR head, not the checkout's synthetic merge SHA.

Exactly one artifact must have the expected shard name, a nonfuture attempt,
matching run/head metadata, and a creation timestamp inside that job's inclusive
execution window. Old artifacts outside the window are ignored. Missing, expired,
malformed or ambiguous evidence fails the report; it never falls back to an older
execution. The checks also reject incomplete API pagination and duplicate IDs.

The workflow downloads exact IDs through the public API with job-local
`actions: read` and `contents: read`. Downloads stay in separate artifact
directories. `stage` requires every shard's exact blob and timing filenames,
validates JSON shape and successful nonempty timing results, and copies them to a
new directory only after all files validate. Vitest remains responsible for
decoding its serialized blob format, replaying test failures and merging coverage.
The merged artifact includes `selection.json` with the chosen artifact/job IDs,
original artifact attempts, report attempt, run ID and head SHA.

Keep the workflow's matrix, job names and file layout in sync with this script
and `cliArtifacts.test.ts`. Older workflows with unqualified artifact names are
not migrated: a rerun uses the original commit's workflow.

## Limits

The carry-forward timestamps are observed GitHub behavior, not a documented
timestamp-containment guarantee. API lag or changed timestamp semantics can fail
closed; do not widen the window or fall back to stale success to make a report
green. The selector tests simulate full, partial and report-only reruns using the
recorded timestamp relationships. Run `bun test scripts/cliArtifacts.test.ts` for
the deterministic selection and filesystem checks.
