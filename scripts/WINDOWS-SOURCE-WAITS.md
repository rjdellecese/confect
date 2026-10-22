# Windows source-watcher timeout experiment

This investigation starts from `098087542592cca2805e02529b4e783b90d539d5`.
Its production behavior matches the failing `6d235a85` head; its additional
failure-only checkpoints are not a timeout fix. The root cause is unproven.

## Initial comparison at `3f3c8c21`

The first revision ran only for the investigation branch. Two
Windows jobs each executed the latest failing late-edit and observed-impl
source scenarios once without tracing and once with tracing. One job runs
controls first, the other traces first. Both modes use the same checkout,
dependencies, assertions, 20-second Effect deadlines and 25-second test budgets.
Each scenario gets a fresh Vitest process and its own result directory so a
previous scenario cannot exhaust its trace allowance. There are eight scenario
executions total, with no conditional retries or stopping after a green result.
Any failing invocation fails its job after the remaining planned comparisons.

The normal full-suite Windows CLI job is unchanged. These isolated invocations
do not reproduce its accumulated process state, ordering or load. A passing
isolated run cannot rule out a full-suite failure, and the comparison is not a
benchmark. Reversed ordering controls one possible warm-up effect; it does not
make two hosted runners identical or prove runner variability.

All eight isolated invocations passed, but the unchanged full-suite Windows
job failed the late-edit case at 20 seconds and watcher-operation recovery
at 15 seconds. The late-edit checkpoints completed initial readiness at
8.688 seconds and the injected module build at 11.386 seconds, then expired
waiting for updated readiness with two updates and five rebuilds recorded.
That failure was not fixture teardown or a blocked injected release.

The isolated late-edit controls took 17.320 and 18.221 seconds. Traced runs
took 17.850 and 18.915 seconds. Inside-lock guard verification occupied
4.507/4.824 seconds of the initial wait and 5.149/5.188 seconds of the updated
wait, measured as clipped unions, not sums. This identifies a costly phase
but does not prove which filesystem operation caused the failed run.

## Current realpath experiment

The first launch at `a036219` stopped in its preflight tests because Node's
Windows `--import` option rejected a drive path rather than a file URL. No
control/native suites ran on that head. The test now preserves the preload
module's file URL; this harness correction is not timeout evidence.

At `0f68431`, both Windows runners reached the preflight and demonstrated a
real string-level compatibility difference: native realpath expands the
`RUNNER~1` short-name ancestor to `runneradmin`, while the original API
preserves it. The original and disabled controls also returned `ENOENT` for
a child beneath a regular file, contrary to the probe's Linux `ENOTDIR`
expectation. No timing suites ran. These failures do not prove a timeout cause
and prohibit treating the native API as an interchangeable production fix.

The workflow retains the exact preflight assertions and records its exit code
and Node version, but now runs the planned timing suites even if preflight
fails. Its aggregate result remains a failure whenever preflight or any suite
fails. This separates the compatibility gate from the latency observation;
a faster run does not erase the recorded semantic difference.

The integrity-verified published `@effect/platform-node-shared@4.0.4` archive
uses Node's `fs.realpath`, not `fs.realpath.native`. The cached opensrc tree
is mislabeled and actually contains 4.0.6, whose Windows adapter uses the
native API. The published 4.0.5 archive still uses `fs.realpath`; upgrading to
that release would not test this mechanism.

The workflow now tests that specific lead, without selecting a production
fix. Each of two Windows jobs runs the complete source watcher file once
with the original API and once with the native API, reversing their order
on the second runner. There are four suite executions (60 runtime cases),
no retries, and no changes to assertions or deadlines. Every nonzero exit
fails its job after the remaining planned comparison. Normal full-suite CI
still has no preloader or phase tracing enabled.

`windowsRealpathExperiment.mjs` is an explicitly enabled, test-only Node
preloader. It selects the callback implementation before Effect loads, so
Effect's existing error conversion remains in place. It affects all callback
`fs.realpath` consumers in that process, including inherited child processes,
not exclusively the guard; do not attribute its entire effect to one caller.
Both modes use the same lightweight callback timing wrapper. Metric records
contain only PID, parent PID, mode, call/completion/error counts and aggregate
elapsed milliseconds, with one small file per process overwritten once per
second and on orderly exit. Sampling uses an unreferenced timer and never
keeps a process alive, and periodic writes stop after ten minutes. A final flag distinguishes exit records from the last
sample of a forcibly terminated worker. Concurrent callback
durations overlap and must not be added to phase wall time. Missing reports
can mean forced termination or collection failure. No path or error text is
recorded. The preloader does nothing without both explicit experiment values.

Before the comparisons, the workflow checks callback, symlink/junction,
missing/non-directory path and buffer-encoding behavior in both modes. Phase
tracing is disabled for this comparison so serialized trace writes cannot be
mistaken for filesystem-adapter overhead. A timing improvement alone is not
proof that every historical timeout shares this cause; retain failed controls
and verify the specific source scenarios against the unchanged deadlines.

## Evidence

Artifacts retain each invocation's exact PR and checkout SHAs, mode, order,
epoch-millisecond window, exit code and Vitest JSON report for seven days.
Traced invocations also record phase files, bounded to 512 KiB per process.
The recorder and phase boundaries are selectively ported from diagnostic head
`f82e1279dab7369131e668f47dca4cf57f9df0ca`; no planner, architecture, termination
or retry behavior is imported from that branch.

The source suite explicitly provides the recorder. Normal source tests and
production commands leave it disabled. Records contain only whitelisted static
phase and outcome tags, epoch times, process/context/revision IDs and counts.
They omit paths, sources, error text, environment and command lines. Collection
failure must not replace the underlying result. JSON test reports retain normal
test diagnostics and are not sanitized phase records.

`Test.wait` numbers the existing checkpoint waits within a scenario. The
late-edit case waits for initial readiness, table rebuild, first update start,
module rebuild, then updated readiness; the observed-impl case waits for initial
and edited readiness. `CompilationInputs.check` includes semaphore waiting;
its nested `CompilationInputs.verify` begins after acquiring the semaphore.
Native starts can occur without a corresponding explicit rebuild request.
Phase spans overlap: use clipped interval unions, never sums of nested spans.
Missing endings can mean interruption, failed collection or the byte limit.
Tracing adds serialized filesystem writes and can perturb execution time.

## Decision rule

Classify each failure as an active readiness/build wait, slow completed work
exhausting the outer deadline, or teardown after all waits completed. Correlate
phase progress with its exact test window. Investigate the dominant phase with
a deterministic reproducer before selecting a production change. Neither green
controls nor green traced runs prove a fix. If no failure reproduces, preserve
that result and choose the next discriminating experiment from the evidence;
do not retry until green or label the runner as the cause.
