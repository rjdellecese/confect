# Windows source-watcher timeout experiment

This investigation starts from `098087542592cca2805e02529b4e783b90d539d5`.
Its production behavior matches the failing `6d235a85` head; its additional
failure-only checkpoints are not a timeout fix. The root cause is unproven.

## Fixed comparison

`windows-cli-investigation.yml` runs only for the investigation branch. Two
Windows jobs each execute the latest failing late-edit and observed-impl
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
