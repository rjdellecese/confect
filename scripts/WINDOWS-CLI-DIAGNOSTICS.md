# Windows CLI process diagnostics

The Windows CLI job in `packages.yml` runs `traceWindowsCli.ps1`. The wrapper
runs the same `pnpm test` in `packages/cli` and returns its exit code. Other jobs
and normal local tests do not enable tracing. Windows CLI jobs always upload
`windows-cli-process-diagnostics` with seven-day retention.

## Records and limits

- `fixtures.jsonl` records synthetic fixture basenames, `dev`/`codegen`, the
  reporting process and child PIDs, UTC epoch milliseconds, lifecycle phases,
  wait attempt numbers, and observed leader exit codes. It never records wait
  text, child output, command lines, environment, or source. The wrapper
  precreates the file and opts in through `CONFECT_CLI_PROCESS_TRACE`.
  Writes are serialized within the CLI suite's existing single worker and
  stop before 4 MiB. Missing or unwritable files disable records, not tests.
- `phase-PID.jsonl` records compilation, native rebuild/capture, evaluation RPC,
  and development-sync phase beginnings and endings. The wrapper opts in with
  `CONFECT_CLI_PHASE_TRACE_DIRECTORY`; without it the CLI does no diagnostic
  filesystem work. Each process appends at most 512 KiB, with monotonically
  assigned operation IDs, epoch timestamps, static phase/outcome tags, and
  whitelisted context/revision IDs, profiles, modes, work tags, and counts.
  No paths, sources, conditions, or error text are recorded. Native callbacks
  retain the trace captured before entering their empty Effect context.
- `processes.jsonl` samples Windows processes outside the test worker, roughly
  once per second plus query time. It selects `node.exe`, `esbuild.exe`, and
  `taskkill.exe`, plus up to 16 ancestry levels. Each process row contains only
  PID, parent PID, creation time, image name, and cumulative user/kernel CPU
  counters in 100 ns units. Snapshots cap at 2,048 processes and mark truncation.
  The monitor stops at 25 minutes or 32 MiB; the Windows CLI job caps at 30
  minutes. The wrapper stops and waits for its monitor in `finally`, including
  when tests fail. Cancellation can leave a partial last record or no upload.

## Interpretation

`ReleaseStart` precedes the spawner's scope finalizer. `ReleaseComplete`
records that control reached the finalizer registered before spawning, even
if release failed. Neither proves successful termination or descendant
reaping. `Exited` is the existing leader exit observation, not a new process
wait or a result from `taskkill`. Correlate PIDs with creation times because
Windows can reuse PIDs; short-lived processes can fall between snapshots.

The monitor explicitly records that handle-owner identification is unavailable.
It neither downloads tools nor intercepts `EBUSY` to retry deletion. A process
remaining in a snapshot does not establish that it owns a fixture handle or
caused an earlier slowdown. These resource records are diagnostic observations,
not performance measurements: tracing adds IO and process queries, and missing
records can mean a budget limit, collection failure, or cancellation.

Phase endings describe the wrapped Effect's outcome, not a semantic guarantee
that an entire build succeeded. Handled compilation failures may produce a
successful outer verification phase; inspect its nested native phases too.
`CompilationContext.nativeRebuild` brackets a request to the native rebuild API,
not every native build. `CompilationContext.nativeStart` is a zero-work marker
from the existing native onStart callback, including watch-triggered builds.
Associate starts with capture/onEnd records by context. Spans can overlap: a
request can wait for native work already in progress, and capture/publication
can occur within another outstanding phase. Do not sum overlapping spans or
count rebuild requests as native build cycles.
`CompilationInputs.check` brackets the existing shared input-verification
operation, including its lock wait, so guard work remains distinguishable from
the native rebuild and capture phases that invoke it.
Phase files can end between a beginning and ending when the process exits or
the byte budget is exhausted. Operation IDs are local to a process lifetime;
correlate PIDs with the process snapshots to account for PID reuse. Source tests
use an unconfigured no-op trace by default, and recorder tests provide their own
temporary sinks rather than inheriting CI's sink.

Phase tracing adds serialized append operations at observed boundaries. It does
not add polling, retries, stabilization attempts, or process waits, but its IO
can affect timing. A traced Linux recovery test validates the instrumentation,
not the cause of a Windows timeout.

The PowerShell collector requires Windows and has no Linux execution coverage.
Deterministic fixture tests cover serialization, opt-out behavior, finalizer
ordering, and failure transparency without changing process termination.
