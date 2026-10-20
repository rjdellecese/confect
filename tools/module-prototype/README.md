# Module-oriented compiler prototype

This private workspace package evaluates a compiler architecture. It is not
published, used by `confect dev` or `confect codegen`, or a production fallback.
The existing compiler remains the compatibility oracle.

See [the backend contract and capability assessment](./BACKEND_CONTRACT.md) for
the subsequent native validation-boundary investigation. It distinguishes
freshness validation from semantic preparation and records real esbuild and
Rolldown probes; it does not promote the adapter below.

The subsequent [Rspack experiment](#rspack-cold-compilation-experiment) uses a
whole compiler with a supported filesystem boundary, not the Vite adapter.

## Run the checks

From the repository root, with the workspace dependencies and packages built:

```sh
pnpm --filter module-prototype typecheck
pnpm --filter module-prototype test
pnpm --filter module-prototype gate
pnpm --filter module-prototype gate:rspack
```

The unit suite covers the compiler's cache and acquisition boundary and the
evaluator's process lifecycle. Its script invokes the root Vitest runner to
avoid mixing runner instances with `@effect/vitest`.

The integration gate lives in `test/integration/compatibility.ts`, separate from
the per-module unit suites. It compares the current bundled compiler with the
prototype in fresh child processes, using temporary fixtures under the CLI test
directory so package resolution matches the CLI. It bounds each side to ten
seconds, removes the fixtures, prints a JSON report, and exits nonzero if the
oracle differs from the fixture or the prototype differs from the expected
result. Run it separately from CLI typechecks while those temporary fixtures
exist. The root production test project does not discover this private package.

The three `*Boundary.test.ts` integration suites run with the private test command.
They check native engine capabilities and limitations; passing them is not a
claim that either engine satisfies the complete backend contract.

**The Vite gate currently fails. Do not benchmark that candidate as equivalent to
the existing compiler.** Passing the unit suite does not qualify the backend.

## Rspack cold-compilation experiment

`gate:rspack` runs the same seventeen fixtures, expected values, rejection control
and ten-second budgets as `gate`. It uses the existing compiler as the oracle
and fresh child processes for both evaluations. **All seventeen oracle controls
and Rspack results match.** The report marks its scope as `cold-semantic-gate`
and explicitly reports `productionQualified: false`.

`RspackCompiler` creates a fresh Rspack 2.2.9 compiler for each preparation, with
both caching and incremental reuse disabled. It supplies the already selected,
flattened configuration to the resolver through a temporary owned configuration
artifact and to `esbuild-loader` through `tsconfigRaw`. The loader uses the
project's existing esbuild implementation for syntax transformation; Rspack owns
the graph, import-attribute identities, CommonJS/ESM linking and artifact output.
Built-in attribute loaders, a public attribute-policy hook and source-file scope
definitions reproduce the exercised contracts without a custom module runtime.
Missing exports are configured as errors rather than warnings.

`compileEntries` also prepares multiple roots under one owned configuration.
A shared native runtime/chunk preserves dependency identity across entry artifacts.
`RspackGraph` detaches native module identities, source and dependency edges before
closing the compiler. It combines those facts with original input observations
and external runtime observations to fingerprint each root; it does not infer
imports from generated JavaScript. Separate configurations require separate batches.

`RspackInputs` supplies the native compiler's input filesystem. A one-shot
capture records returned byte hashes, realpaths, errors, stat identities/kinds,
directory entries and symlink results. Repeated inconsistent observations fail;
sealing rejects pending and later requests. Validation replays the recorded
requests against current inputs without mutating the receipt. The adapter
validates before and after fresh evaluation; output equality does not erase a
comment-only input edit.

This filesystem implementation is deliberately **Linux-only**. Before reading
bytes it rejects protected pathnames/realpaths, opens regular files with
`O_NOFOLLOW`, and checks the opened descriptor through `/proc/self/fd`. It is not
hardlink tracking or an atomic snapshot against arbitrary concurrent renames.
It supports the six default string-path callback forms used by this pipeline,
not arbitrary filesystem options or arbitrary third-party loaders/plugins.
Stat fingerprints include kind predicates, device/inode, mode/link count,
ownership, size and modification/change/birth times. They exclude access time,
block count and block size. The native callback bridge and its deterministic
race mocks have narrowly scoped Node-import/async lint exceptions.

Live compilation uses an artifact-filtered filesystem view: compiler-owned
directories are absent from directory listings, and their entry-count, size and
modification/change-time effects do not invalidate parent-directory observations.
Directory stat observations instead include sorted non-artifact membership while
retaining kind, device/inode, mode, ownership and birth time. Authored membership
changes and directory replacement still invalidate the view. The scoped flattened
configuration is visible only at its exact internal paths; its observations are
checked during compilation but not retained after that scope closes.

The seven real-engine tests in `rspackBoundary.test.ts` also qualify public API
behavior separately from this cold adapter:

- Source/package reads, missing candidates, context directory enumeration and
  symlink resolution reach the injected filesystem. Explicit changes refresh
  same-metadata package edits, shadow candidates, symlinks and removed files.
- With incremental reuse enabled, a retained module may produce no new source
  reads. Even `cache: false` does not turn a rebuild with an empty change set
  into an independent freshness check. A newly added context member also needs
  its directory reported as changed; reporting the new filename alone did not
  refresh that context.
- A source mutation after acquisition leaves the build using the acquired
  bytes, not a later reread. Rspack does not itself reject this race; Confect's
  capture validation is responsible for detecting it.

The cold adapter avoids warm-cache provenance assumptions rather than claiming
to have solved them. Its unit coverage additionally checks exact physical file
scope, owned configuration without nested rediscovery, missing-export failures,
fresh evaluation and comment-only invalidation. The filesystem tests exercise
capture, replay, sealing and read-safety cases.

### External policy and revision qualification

`RspackExternals` keeps the production distinction between workspace modules and
third-party runtime dependencies. Native resolution classifies the request;
the existing `createRequire`/`exsolve` policy selects the actual runtime target,
with the owned input guards around it. Tests cover import/require/custom export
conditions, singleton identity, nested installations, workspace symlinks, aliases,
deferred import failure and restart detection. Observations seal before publication.
Raw runtime resolution is outside Rspack's recorded filesystem, so these captures
report `reusable: false` rather than certify emission-free preparation reuse.

The expanded gate adds explicit Node `createRequire` and free `require.resolve`
cases. Rspack's default parsing can turn the latter into a module ID instead of a
Node filename. Setting only `requireResolve: false` is insufficient: it still
rewrites the free `require` into a context module. The adapter sets both
`requireResolve: false` and `requireAsExpression: false` through public parser
options, preserving the Node call and matching the oracle in fresh processes.
Nested-importer tests distinguish a global entry-rooted require from a named local
`createRequire`; they must not be conflated. A public graph hook rejects any
remaining parsed resolve dependency instead of silently returning a module ID.

Those preserved runtime lookups are outside the compiled graph in both the oracle
and the candidate. A target edit can change a fresh evaluation while preparation
validation still succeeds. `reusable` concerns compiler preparations only, never
evaluated exports or acknowledgment of runtime work. No evaluated values are cached.

The revision integration tests use real multi-root Rspack artifacts with the
existing `CompilationState`, `Compilation.runJob`, `CompiledModule.Consumption`
and `DevelopmentState` bookkeeping. They check comment-only, shared and lazy-edge
changes, stable unchanged fingerprints, shared module identity, partial-root
receipts, pending siblings/newer revisions, and no acknowledgment after failed
post-evaluation validation. These tests exercise the accounting boundary; the
separate live integration below exercises the development coordinator.

**The original live candidate failed the representative scale gate. A corrected
batch-boundary candidate is undergoing the same gate; production remains
unchanged.** PnP projects
are explicitly rejected before configuration discovery without evaluating their
loaders. Full diagnostics/runtime-condition coverage, warm-cache provenance and
portable read protection remain unqualified. Validation is still whole-capture
and conservative when a sibling changes.

### Isolated live development loop

The private launcher uses the existing `dev.runSession`, development-state
coordinator, supervisor and evaluation worker. Production commands still select
esbuild. A backend-neutral preparation seam returns native artifacts and import
graphs without pretending they are esbuild metafiles; default delegation and
existing compilation budgets remain covered by the CLI suite.

Build the workspace first, then build the private launcher:

```sh
pnpm build
pnpm --filter module-prototype build:dev
```

From a disposable consumer project, run Node with the absolute path to
`tools/module-prototype/dist/rspackDev.mjs`, followed by `dev`. The compiled
launcher needs this checkout's dependencies and built evaluation worker; it is
not a distributable CLI. The private test command rebuilds it before testing.

`RspackSession` partitions lexical entry configurations once per explicit batch,
cold-compiles its configuration groups and retains only validation evidence
between jobs. Artifacts are
immutable and shared only inside an evaluation's `ArtifactScope`. Native graphs
are projected to the requested entry before package-import checks, so an impl
compiled in the same batch cannot contaminate its spec's graph. The adapter uses
the existing receipt, failed-attempt and pending-root protocols, with at most
eight stabilization attempts. A 250ms polling interval replays observations
outside active batches; unchanged evidence does not rebuild, but idle validation
still incurs I/O. Active batches validate before publishing their buffered receipts.

Generated ownership follows canonical resolved paths and explicit authored
exceptions. Generated JavaScript and TypeScript execute through the ordinary
code loader; only non-code files use the JSON/text fallback. Generated contents
are excluded from authored fingerprints while native identities and edges remain
available. Component imports wrap real definitions using supported native hooks;
CommonJS component imports fail closed rather than use ESM resolution silently.

Live tests compare generated files with the production command across source
edits, syntax-error recovery, configuration restart, mixed configuration profiles
and component-definition edits. Session tests separately cover artifact cleanup,
fresh evaluation, pending siblings, newer revisions, failed-batch recovery and
the stabilization bound. This is a bounded Linux qualification, not proof of all
production lifecycle cases or evidence that the integration is faster or simpler.

### Representative scale result

Frozen candidate `e341d9ad9a7dec502b453bc877f41013128103fc` did not reach initial
readiness within the existing 180-second budget on the 390-group, 275-table
fixture. The comparison stopped at that first candidate failure: no edit was
attempted, and the remaining nine of twelve planned runs did not start.

| Version                           |            Startup |   Impl reload | Sampled peak process-tree RSS |
| --------------------------------- | -----------------: | ------------: | ----------------------------: |
| 10.3.1 (`eaa5da76`)               |           10.912 s |       3.033 s |                     913.3 MiB |
| Consolidated esbuild (`d3e63cfa`) |           18.197 s |       8.786 s |                     956.6 MiB |
| Rspack (`e341d9ad`)               | Timed out at 180 s | Not attempted |                   1,069.3 MiB |

These are individual sequential, unprofiled runs, not averages. Both completed
baselines matched all 1,064 generated files, 390 startup implementation
evaluations, only `g0` on reload, two readiness messages and one reload message.
The candidate recorded zero implementation evaluations and zero readiness
messages; its output parity at this scale therefore remains unverified. All three
runs reached at most four processes and passed cleanup without forced killing.
RSS was sampled every 250ms, so short peaks can be missed; the candidate's final
774.4 MiB sample is not readiness or steady-state memory.

The compiled plain-Node launcher, shared dependency bindings, native loader and
evaluation-worker shim were checked before measurement. Before/after fingerprints
matched for all three source trees, 298 build files and 4,558 runtime-package
files. Neither runtime TypeScript compilation nor a changed baseline explains
the result. The uninstrumented logs end after generated-file writes and did not
attribute the consumed budget; the subsequent profile below does. Native shutdown
also emitted `ObjectRef is not unref` warnings; process cleanup still passed.

**Do not adopt this integration on the present evidence.** Small-project semantic
and lifecycle qualification passed, but practical scale qualification did not.
This rejects the current cold integration, not Rspack in general. Completing
PnP, portability or warm-cache work would not substitute for practical scale
evidence.

Full logs, per-file hashes, process samples and binding/fingerprint proofs are
retained in the run evidence directory `rspack-live-comparison`. Its
`SHA256SUMS` digest is
`e215b5c17780c8ef8aac68c3fe37bada9774b6f5148e1e5d07e4efa2926fe2dd`;
`summary.json` is
`e045d8d7a639bb8e8b1656ec7ab48cf991e22b31302f20f7a9e540614d4f4a4d`.
The preserved benchmark-only Node harness retains 22 sequential-await lint errors
and 25 Effect-style warnings; the separately checked repository source has no
remaining lint diagnostics. No further timing or implementation work is running.

### Startup profile: repeated batch work in the adapter

A subsequent diagnostic run used the same frozen candidate, 390 groups, 275
tables and 180-second limit. A scratch copy of the compiled launcher added
Effect span aggregation and timed the native `compiler.run` callback. Node CPU
profiles covered the supervisor, compiler process and evaluator. The frozen
sources, 298 build files and 4,558 dependency files remained byte-identical.

The dominant stall is repeated work in the adapter, not an uncompleted native
build or slow authored evaluation. Table validation took **102.0 seconds**;
the batch build finished after **12.2 seconds**, leaving about **89.8 seconds**
for per-entry preparation and validation. All 275 table RPCs completed, consuming
only 0.84 seconds of cumulative RPC span time. The spec/impl batch then finished
building in 40.9 seconds, but only 35 spec RPCs completed before cancellation.
Implementation evaluation had not started. The evaluator was idle in 99.4% of
its CPU-profile samples.

Across the run, the adapter entered 314 per-entry preparations and performed:

| Operation                       |                                                 Observed work |
| ------------------------------- | ------------------------------------------------------------: |
| Native `compiler.run`           | 5 calls, 40.1 s total including JS hooks/filesystem callbacks |
| Whole-capture replay            |                        406 calls, 66.9 s cumulative span time |
| Root canonicalization           |                    104,025 calls, 23.8 s cumulative span time |
| Resolution-input fingerprinting |                                                 646,622 calls |
| Configuration lookup            |                     104,016 calls, 1.0 s cumulative span time |

Nested and concurrent spans overlap: these times must not be summed into an
elapsed-time breakdown. Four per-entry requests were pending at cancellation;
ended spans include interrupted work. These instrumented durations are diagnostic
evidence, not a replacement for the unprofiled benchmark.

The mechanism is visible in `RspackSession.prepare`: it partitions and
canonicalizes every batch root before consulting the artifact-scope cache, then
replays the entire captured input set even on a cache hit. The returned compiler
validator also performs resolution-input checks before and after that replay;
the caller performs additional checks. The four-way table/spec concurrency waits
on the adapter's single preparation lock, and polling adds further replay work.
Batch artifacts are reused, but batch preparation and validation costs are paid
again for each entry. Configuration discovery itself is cached and was not the
dominant cost; repeated canonical filesystem lookups and replay were.

The next corrective experiment should separate immutable batch preparation from
per-entry lookup, retain lexical/canonical provenance in that batch capture, and
coalesce validation at explicit preparation/publication boundaries. It must keep
the existing stale-publication, symlink, failed-attempt and pending-root tests;
memoizing a successful freshness check or weakening guards is not a fix. The
native-run intervals include adapter hooks and profiling overhead; they are not
a lower bound on an optimized backend's startup. Removing the duplication alone
does not prove performance parity or isolate Rust compiler cost. No implementation
change was made during this profiling task.

The diagnostic evidence is retained as `rspack-startup-profile-evidence`.
Its manifest digest is
`f24a368ed926d3033a6bc09b22612854754679880cc08f76a2f9304f203a96b5`;
`summary.json` is
`8bf130f53c1b7ca1d13b643e21bc66facc8bdc8b7af22b4e13bf637f42a8101c`.
The scratch profiler/controller have zero lint errors and three remaining
Effect-style warnings for deliberate Node filesystem/timer instrumentation.

### Batch-boundary correction

Frozen candidate `6a0f3b5735d0ebe0a38b869a2d09c11f8b79d909` implements the
profile-derived correction. Its scale results are pending; the older timeout
above remains evidence about `e341d9ad`, not a measurement of this revision.

An optional native batch hook leaves the existing esbuild batch path unchanged.
The native hook records lexical `lstat`/`realpath` provenance and configuration
partitions once, indexes the captured graph once, and serves immutable per-entry
artifacts without repeating whole-batch filesystem work. Direct preparations
outside a batch retain their per-call guards.

Each boundary validates its captures and root plan before releasing consumption
receipts. A stable authored evaluation failure still acknowledges the roots it
actually evaluated; a failed freshness check releases none. Nested disjoint
batches, outside-root entries and older captures remain included in the outer
boundary's checks. Polling pauses while a batch is active rather than competing
with the same checks; configuration guards and the closing validation remain
authoritative.

Lexical root bindings also survive in the compiler context. A changed root target
requests the existing resolution-input restart and clears the prepared receipt,
so an acknowledged old canonical target cannot silently leave the coordinator
idle after a symlink retarget. Ordinary source edits remain on the incremental
development path.

The regression fixture exercises twelve roots with four-way concurrency and
nested subsets. It requires one native compilation, one guarded root resolution
per root per boundary, at most three retained-capture validation calls on the
first boundary and two on the next unchanged boundary. Additional cases cover
mid-batch source/config edits, retargets and fresh-session recovery, deferred
receipts, stable authored failures, nested/outside captures and multiple retained
revisions. All existing assertions and budgets remain unchanged.

The frozen correction passes 165 private tests, 1,424 default CLI runtime/type
checks and all seventeen semantic oracle controls, plus exact/inexact typechecks,
the workspace build, formatting and lint. These checks authorize the repeated
scale experiment, not adoption or a performance-parity claim.

## Vite module-oriented adapter

### What it does

`Compiler` reuses Confect's owned configuration discovery, resolution-input
guards, and native resolution plugin. One esbuild context resolves the graph
during a synthetic driver load; it receives the owned `tsconfigRaw` rather than
selecting another configuration. Actual authored modules are transformed
individually with esbuild and Vite's public `moduleRunnerTransform` API.

The cache belongs to a single configuration session. Each compilation reads
current bytes and resolves current edges. Reuse requires the same realpath,
loader, namespace-derived module identity, and byte digest. Transformations are
published to the cache only after source and configuration validation; changed
inputs retry within a bounded stabilization loop. Snapshots retain their own
code and import maps, and callers can validate them again before and after use.

`Runner` starts a new Node process for every evaluation. Its Vite module runner
can fetch only modules and external references recorded in that snapshot.
Importer-specific edges are mapped before Vite's cache lookup, so identical
relative specifiers in different directories cannot collide. Evaluated exports
are never retained across jobs. A separate native-import request evaluates the
oracle artifact; it is not a fallback when the prototype fails.

### Compatibility result

With Node 24.21.0, esbuild 0.28.2, and Vite 8.3.4, all seventeen oracle fixtures
match their expected outcomes. Eleven prototype cases match, including the nine
matches from the original fifteen-case gate: inherited aliases,
live bindings, a cyclic graph, literal dynamic imports, importer-relative
identities, ordinary JSON attributes, the oracle's TypeScript-attribute
behavior, CommonJS default imports, Node builtins, and lazy Confect schemas
(some cases exercise more than one behavior). Both added explicit Node runtime
resolution cases also match.

Six cases block qualification:

| Case                                    | Existing compiler                   | Prototype                       |
| --------------------------------------- | ----------------------------------- | ------------------------------- |
| One JSON file imported as JSON and text | Distinct object and string values   | Both become objects             |
| Unsupported import attributes           | Rejects the module                  | Accepts it                      |
| CommonJS named imports                  | Returns the named value             | Returns `undefined`             |
| Authored `require` edges                | Resolves and bundles the dependency | `require` is not defined        |
| Module suffix identity                  | Distinct module instances           | Explicitly unsupported          |
| Authored `__filename` / `__dirname`     | Preserves file scope                | Does not provide those bindings |

These are limitations of this thin adapter, not claims that Vite cannot support
the behaviors through a broader pipeline. The adapter does not yet reproduce
the current loader pipeline or CommonJS linking semantics. In particular,
using specifier-only dependency lists loses import-attribute identity.

The gate is necessary, not sufficient, for a production backend. Full Watch
integration, receipts and pending-edit accounting, diagnostic parity, complete
namespace/attribute coverage, generated-input invalidation policy, runtime
condition flags, and platform coverage still require qualification. No current
production guarantee is relaxed by this experiment.

### Architectural consequence

Do not promote this adapter or infer a speedup from its smaller compilation
units. A replacement needs a complete loader/resolution/linking contract before
performance comparison. esbuild already caches parsed syntax; the performance
hypothesis is avoiding broader graph and output work, not merely caching parses.
The preserved tests and gate make the remaining compatibility cost explicit.
