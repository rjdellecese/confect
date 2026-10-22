# Windows apparatus qualification

This private, dependency-free probe tests synthetic Node processes, not Confect
or either benchmark revision. It does not authorize performance trials, change
the five-second shutdown deadline, or replace any comparison guard. The parent
must approve a concrete shutdown and observer contract before comparison work.
The root lint configuration permits Node APIs and sequential polling only for
this standalone script; application lint policy is unchanged.

## Run

On Windows, use an empty output directory:

```sh
node tools/windows-qualification/probe.mjs path/to/new-results
```

The dedicated pull-request workflow runs on Windows Server 2025 with Node
24.21.0, installs no project dependencies, and always attempts to upload bounded
diagnostics for seven days. A failed qualification is expected evidence, not a
reason to loosen the thresholds. The job has a five-minute ceiling; the probe
has a 90-second watchdog, and each synthetic process has a 75-second watchdog.

## Shutdown evidence

The leader spawns one descendant, with no IPC channel, internal dev-session
setting, preload, inspector, signal forwarding, or native helper. Each records
readiness, actual Node `SIGINT`/`SIGTERM` receipt, asynchronous cleanup completion
after 600 milliseconds, and normal exit. The leader deliberately does not wait
for its descendant, so leader-only exit cannot masquerade as tree cleanup.
The leader uses Node's public `spawn({ detached: true, stdio: 'ignore' })` option
to give it a separate Windows console rather than reuse the workflow runner's
console. The descendant inherits the synthetic leader's console. This is a
synthetic safety arrangement, not proof of equivalence to either benchmark's
launcher; adopting a different launcher still needs the parent's approval.

After at least 30 seconds of observation, the probe invokes the public Windows
command `taskkill.exe /PID <leader> /T`, **without `/F`**. Success requires both
processes' signal/cleanup/zero-exit records, leader exit status, and a recent
observer snapshot showing both PID-plus-creation identities absent within five
seconds of invocation. A successful taskkill status alone is insufficient.
Every owned PID must be a positive safe integer, never the runner's own PID.
Readiness ties the root to its spawn handle and the descendant to the root;
CIM creation timestamps and parent identities must agree. The root identity is
checked again before taskkill. There are no process-group comparisons, wildcard
targets, console broadcasts, or taskkill commands against the workflow runner.
Missing records distinguish exit without cleanup proof from complete cleanup;
the probe does not infer which OS termination mechanism produced missing records.
Surviving descendants distinguish leader-only exit from complete tree cleanup.

After the verdict, a separate emergency-stop file asks surviving synthetic
processes to exit with code 2. Those events cannot qualify shutdown. The
synthetic watchdog is a final leak guard, not a successful shutdown path.

## Observer evidence

One persistent `powershell.exe -NoProfile -NonInteractive` process uses public
`Get-CimInstance Win32_Process`. Its sequential loop targets 250-millisecond
starts and cannot overlap queries. Each newline-delimited JSON frame contains
the sequence, monotonic start and query duration, and PID, parent PID, creation
timestamp, executable name, cumulative CPU milliseconds, and resident bytes.
It does not read command lines, environments, or project files. The Node reader
also records monotonic frame-arrival times to expose buffering delays.
Rows without a creation timestamp remain visible but cannot become owned
identities. PID alone is never sufficient to identify a surviving owned process.
Unexpected descendants and possible children without creation timestamps block
successful tree qualification rather than disappearing from the cleanup result.

The report includes the full bounded snapshots, raw taskkill output, observed
identities, peak resident memory, maximum query/start/arrival intervals, and
overlap count. Limits are 200 frames, 4,096 rows per frame, 1 MiB per frame,
32 MiB observer output, 16 KiB event output, and 16 KiB taskkill output. Query,
start-gap, and arrival-gap maxima must each stay within 250 milliseconds; no
jitter allowance is silently introduced. This conservative check can fail from
scheduling jitter even if average cadence looks adequate. The parent must
review raw evidence rather than infer observation accuracy from an average.

This is only a feasibility probe: it does not implement the comparison's
resource ceilings, evaluation/output guards, short-lived-process accounting,
or CLI integration. It records observed memory and CPU counters but does not
claim that sampling captures every process peak or exit between samples.

## Interpretation and next decision

`result.json` keeps `comparisonAuthorized: false`, even if both evidence checks
pass. A missing signal, incomplete cleanup, deadline breach, stale identity
snapshot, malformed frame, output overflow, observer error, or cadence overrun
blocks this probe. Windows behavior is untested until the workflow runs.

If taskkill cannot deliver graceful signals, stop here and take the result back
to the parent. A separately approved, pinned benchmark-only `node-pty`/ConPTY
probe could test `pty.write('\x03')` through its public terminal API. It would
need to establish console signal receipt and terminal-host/tree ownership,
qualify both revisions identically, and account for changed terminal I/O and
launcher cost. It must not claim equivalence to pipe-based timing. This probe
adds no PTY dependency and makes no claim that Ctrl-C through a PTY works.

On Linux, `node tools/windows-qualification/probe.mjs --self-test` checks six
classifier cases and seven invalid-PID cases using fabricated fixtures confined to that test.
It does not validate PowerShell, taskkill, console signals, or Windows cadence.

Public API references: Microsoft's [taskkill documentation](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill)
defines `/T` and `/F`, but does not promise Node signal delivery. The
[Win32_Process class](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-process)
defines the observed identity and resource fields. Only an actual Windows run
can establish the behavior this probe requires.
