# Compiler backend contract and capability assessment

## Decision

Keep Confect's owned configuration, revision, publication and recovery model.
Keep a mature compiler responsible for module semantics. Do not promote the
thin Vite adapter, replace native resolution with a Confect resolver, or equate
watcher silence with freshness.

Upstream compiler changes and private compiler forks are out of scope. The prior
recommendation to pursue a native refresh/capture extension is withdrawn.
Emission-free validation is an optimization hypothesis, not a requirement that
justifies maintaining compiler internals. Ordinary full preparation remains a
valid implementation when exact freshness cannot be established more cheaply.

The alternative worth qualifying is a **supported input-filesystem boundary**.
Confect records the filesystem facts supplied to a whole compiler, while that
compiler retains resolution, loading and linking. Unchanged complete observations
could validate an existing preparation without invoking the compiler; changed
inputs still require normal preparation. This needs neither a scan-only API nor
an unbundled runtime. It is not yet a qualified Confect backend.

webpack exposes such a public boundary; current Rspack also exposes filesystem
injection and explicit rebuild inputs, with experimental filesystem configuration.
These are more concrete candidates for this approach than adding APIs to esbuild.
Keep esbuild as the production backend and compatibility oracle while assessing
the alternatives. Its remaining performance regression is not accepted as the
long-term endpoint.

## Ownership

| Owner            | Responsibility                                                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confect          | Select and flatten the lexical configuration once; own configuration/package observations, job planning, prepared revisions, scoped evaluation, consumption receipts, publication, pending edits and recovery. |
| Compiler backend | Own the resolved module graph, loader semantics, transforms, CommonJS/ESM linking and artifacts. Report the facts it actually used, including discovery dependencies.                                          |
| Watchers         | Schedule work. Their events may be duplicated, delayed or missing; they cannot certify that a revision remains current.                                                                                        |

Confect can retain compiler-produced facts without becoming another graph
authority. It must not independently parse imports, enumerate the compiler's
extension candidates, or reconstruct identities from generated JavaScript.
The engine must consume Confect's effective options rather than choose another
tsconfig. Introducing an adapter must not introduce a second configuration policy.

## Required facts

A backend receipt must describe the captured computation, not a later reread
that happens to return similar data. It needs:

- **Module identity:** the effective configuration/profile and conditions,
  namespace, suffix, import attributes, loader and the engine's resolved identity.
  A physical pathname alone is insufficient.
- **Loaded input identity:** the exact original and transformed bytes used by
  loaders, together with relevant lexical/real paths. Input identity advances
  even when emitted JavaScript is unchanged.
- **Resolved edges:** importer identity, original request, import kind,
  attributes, resolution context, resolved identity and external status.
- **Discovery evidence:** absent candidates, directory/glob membership, package
  and resolution metadata, realpath/target-kind observations, and declared plugin
  dependencies. Existing successful edges alone do not describe this set.
- **Provenance and lifetime:** the owning context and revision, complete versus
  incomplete observations, structured diagnostics, and the resources that keep
  the capture valid. A late callback cannot mutate a newer revision's capture.

Built-in and plugin reads both matter. A callback's `watchFiles`/`watchDirs` is
not proof that it exposes every read performed by the native resolver. A cache
entry checked only with stat metadata is not an exact-byte receipt.

An equivalent boundary could run the engine against a caller-owned immutable
filesystem view that records every read. That separates file observation from
module semantics without making Confect guess the resolver's lookup rules.
Intercepting only source-load callbacks is not such a filesystem boundary.
Read restrictions apply before bytes are read, including protected files and
their aliases. Detecting a mismatch after a forbidden read would not satisfy
that policy.

## Refresh is not readiness

These operations describe responsibilities, not a required new compiler API:

1. **Refresh:** inspect current inputs and native discovery state against a
   receipt. Return current, changed, restart-required, unproven, or a structured
   failure. A current result requires complete evidence and no stale callbacks.
   It does not evaluate authored modules or generate a new artifact set.
2. **Prepare:** parse, resolve, load, transform and link as necessary, producing
   a semantically valid candidate and its artifacts, or diagnostics. Ideally
   preparation can consume the exact native capture from refresh rather than
   rescan into a different revision.
3. **Evaluate and publish:** Confect evaluates requested roots in fresh scopes,
   records actual consumption, validates at the existing boundaries and commits
   only the work that was consumed. Newer edits remain pending. A current result
   for one root cannot acknowledge a changed sibling.
4. **Release:** close captures, artifacts and contexts according to their owning
   scopes. Retained revisions must not grow without bound or leak worker state.

An unchanged, previously linked revision may reuse its semantic result when
its complete observations still hold. A newly scanned graph cannot be called
ready merely because parsing and resolution succeeded: linking may still fail.
If freshness is unproven, full preparation by the **same backend** remains safe;
calling such a path an emission-free optimization would be false. This is not
a fallback between two compiler implementations.

No atomic whole-filesystem snapshot is assumed. Captures retain exact observed
facts, acquisition inconsistencies are rejected or stabilized within a bound,
and later edits are represented as later work. Configuration and resolution
changes continue to require a fresh process under the existing policy.

### Acceptance examples

| Change or event                                                      | Required result                                                                                                                    |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| No input or discovery change after a successful preparation          | Current without new artifact generation; this alone acknowledges no evaluation.                                                    |
| Comment-only authored edit with identical emitted code               | A new input revision and affected-root work; output equality does not erase the edit.                                              |
| A new higher-priority extension candidate or glob member             | Changed discovery/graph state even when all previously loaded files are byte-identical.                                            |
| Same-size, same-mtime package/configuration edit                     | Exact invalidation/restart, regardless of native stat-cache hits.                                                                  |
| Bytes or realpath change during acquisition, including an A/B/A race | Reject inconsistent provenance or retry within the stabilization bound; never certify a later reread as the bytes originally used. |
| Same file imported with distinct attributes or suffixes              | Preserve distinct engine identities and loader behavior.                                                                           |
| Missing export in a newly scanned graph                              | Preparation fails; scan success is not readiness.                                                                                  |
| A newer edit arrives while an older capture is consumed              | Keep the older capture scoped and exact; its receipt cannot acknowledge newer or sibling work.                                     |

## Executable evidence

Run these probes from the repository root with the installed, locked versions:

```sh
pnpm exec vitest run --config tools/module-prototype/vitest.config.ts test/integration/esbuildBoundary.test.ts test/integration/rolldownBoundary.test.ts
```

These results were checked on Linux. They are not cross-platform qualification.

### esbuild 0.28.2

Five real-engine probes establish:

1. A retained plugin `build.resolve()` works outside a rebuild. It invokes no
   build-start, load or build-end hooks and produces no artifacts. The same call
   still succeeds after the target's source is made syntactically invalid;
   resolution success is not semantic validation.
2. Resolver-only calls see a missing file become present, an extension-shadowing
   candidate appear/disappear, and a symlink retarget without watcher events.
3. JSON/text import attributes can resolve to the same pathname/namespace/suffix.
   The original attributes must remain part of identity. Suffixes are returned
   separately from the pathname.
4. With the inode, size and old mtime unchanged, a context can return a cached
   package target after `package.json` bytes change. A fresh context resolves the
   new target. Confect's existing exact metadata guard rejects that change.
   This is evidence for retaining the guard, not a production regression claim.
5. Replaying all recorded resolve-hook requests misses a newly added member of
   a dynamic-import glob. A subsequent native rebuild includes that new module.
   Thus byte checks plus replayed successful requests do not prove completeness.

The source agrees with these observations: `pkg/api/api_impl.go` constructs a
fresh resolver for each plugin resolve call, using a long-lived filesystem with
directory caching disabled, but shares the context's `cache.CacheSet`.
`internal/cache/cache_fs.go` can reuse file contents by `ModKey`.
`BuildContext` exposes rebuild/watch/serve/cancel/dispose, not refresh or a
read-set receipt. `ResolveResult` exposes resolution results, not built-in
positive and negative read observations.

### Rolldown 1.2.13

Three real-engine probes establish:

1. `rolldown/experimental.scan()` loads modules and exposes a graph through
   `buildEnd`/`getModuleInfo`, without `renderStart` or `generateBundle`.
2. Scan succeeds for a graph with a missing named export that normal generation
   rejects. This matters for newly prepared revisions; it does not rule out
   validating an unchanged, previously linked revision from complete facts.
3. With watchers disabled, `DevEngine.triggerFullBuild()` picks up an edit.
   `skipWrite:true` prevents disk output but still runs rendering/generation.

The public-source inventory adds these constraints:

- `scan` closes its bundler and returns no reusable scan-session handle. The dev
  graph is readable, but no persistent scan-only update operation is exposed.
- Module information provides resolved static/dynamic IDs, not a complete
  original-request/attribute/discovery record. Internal attribute support must
  not be confused with a public observation API.
- No complete native read/negative-candidate receipt or Node filesystem/epoch
  control was found. The standalone experimental resolver's `clearCache()` is
  not control over the dev engine's resolver cache.
- Bundler `tsconfig` accepts boolean/string, not the owned flattened object.
  Disabling discovery and mapping explicit options would need parity proof;
  accepting a filename would reintroduce independent configuration selection.
- Scan and dev controls are experimental. A change of engine would also require
  the full Confect compatibility suite, not only these boundary probes.

Relevant source locations are `src/api/experimental.ts`,
`src/api/dev/dev-engine.ts`, `src/plugin/plugin-context.ts`,
`src/types/module-info.ts`, and `src/options/input-options.ts` in Rolldown's
package source. The native link stage reports missing-export diagnostics.

## Alternatives using existing APIs

| Alternative                                                  | Assessment                                                                                                                                                                                                             |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep whole esbuild preparations                              | Preserves the qualified module semantics and existing guards. It is the safe production baseline, but does not by itself resolve the measured latency and memory regression.                                           |
| Skip esbuild rebuilds using known files and replayed imports | Rejected: the probes demonstrate missing discovery evidence. Watcher events and output equality do not repair that gap.                                                                                                |
| Expand the thin Vite adapter                                 | Not preferred: fixing the failed gate piecemeal moves loader and linking responsibilities into Confect. Adopting the full pipeline would be a separate migration, not a small adapter fix.                             |
| Use webpack with its input filesystem API                    | A concrete stable integration surface below resolution. It needs semantic/configuration parity and performance qualification; replacing a fast native compiler with a JavaScript compiler is not inherently a speedup. |
| Use Rspack with its input filesystem API                     | A native whole-compiler candidate with public explicit invalidation. Its filesystem option is experimental, and native/JavaScript crossing costs, cache provenance and compatibility still require qualification.      |

webpack's [compiler API](https://webpack.js.org/api/compiler-object/) exposes
`inputFileSystem`; its resolver receives that filesystem too. In Rspack 2.2.9,
`experiments.useInputFileSystem` selects the injected filesystem, and the native
binding supplies it to the compiler and resolver factories. A catch-all selection
is necessary for this design: intercepting source files but leaving native
package/discovery reads outside the boundary would repeat the original problem.
Rspack's public `run(callback, { modifiedFiles, removedFiles })` accepts explicit
changes. An empty change set must not be mistaken for an independent freshness
check; Confect would derive these sets from exact observations, not trust events.

A filesystem boundary is generic observation, not a second resolver. It must
record returned bytes, missing results, directory entries, kinds and symlink/
realpath results. It must enforce protected-path policy before reads. Loader and
plugin access outside that boundary, external runtime inputs and cache reuse all
need explicit treatment. A cached module does not become observation-free merely
because it caused no filesystem calls in a later compilation.

Owned configuration remains mandatory. A backend accepting a filename rather
than an object is not automatically unsuitable: an explicit, Confect-produced
flattened configuration artifact can preserve one selection authority, provided
relative-path semantics, secondary discovery and exact provenance are qualified.
Passing the user's original tsconfig back to an independently discovering backend
would not satisfy that condition.

## Qualification decision

The subsequent [cold Rspack experiment](./README.md#rspack-cold-compilation-experiment)
matches all seventeen semantic oracle cases using public APIs. It also exercises
external runtime policy, native per-root graph fingerprints, exact cold-capture
validation and the existing receipt bookkeeping. Public parser settings preserve
Node runtime resolution rather than converting it to module IDs. Both pipelines
leave those runtime calls outside the compiled graph; preparation validation is
not evaluation freshness. Raw external-resolution probes are conservatively
ineligible for certified preparation reuse. These results are positive feasibility
evidence, not completion of the qualification gates below: PnP is rejected, the
read guard remains Linux-only, and warm-cache provenance remains unqualified.
The subsequent private live launcher now wires the candidate to the existing
development coordinator without changing the production default. Its bounded
tests cover generated-code ownership, mixed configurations, real component
definitions, edit/recovery/restart behavior and scoped receipt accounting. They
do not establish performance parity or general production readiness.

The representative scale run subsequently failed: frozen live candidate
`e341d9ad` did not reach initial readiness within the unchanged 180-second budget
for 390 groups and 275 tables. Both esbuild baselines completed the same workload;
the remaining repetitions stopped on the candidate failure. This integration
does not pass the practical adoption gate. A subsequent profile attributes the
dominant stall to repeated batch-wide preparation and validation in the adapter:
the table batch built in 12.2 seconds, while its full validation phase took
102.0 seconds. This does not establish that Rspack itself is inherently slow or
that fixing the duplication would achieve parity; see the
[profile and proposed corrective experiment](./README.md#startup-profile-repeated-batch-work-in-the-adapter).

The resulting [batch-boundary correction](./README.md#batch-boundary-correction)
is implemented in frozen candidate `6a0f3b57`, with explicit validation boundaries,
buffered receipts and retained lexical root provenance. It passes the full
regression suite, separate representative correctness gate and all twelve matched
trials. It remains 3.6–3.7 times slower at startup and about 4.53 times slower on
reload than consolidated esbuild, with roughly 25% higher sampled memory peaks.
The [measured correction](./README.md#corrected-scale-result) fixes the timeout
but fails the practical adoption criterion. The older timeout is not this
revision's result, and unqualified warm caching is not an assumed remedy.

The subsequent [bounded warm experiment](./README.md#bounded-warm-session-experiment)
retains native contexts and original acquisition evidence for reusable captures.
Changed observations drive public rebuild inputs; only actual native callbacks
replace facts. Unreacquired changes and warm failures force a cold recapture,
while a bounded native-build epoch retires obsolete evidence. Artifacts remain
job-scoped and evaluation remains fresh. Raw external runtime probes still
prohibit reuse, including in the representative Confect workload. The
[matched warm-candidate comparison](./README.md#bounded-warm-scale-result) passes
correctness but remains 3.64–3.92 times slower at startup and 4.83–5.12 times
slower on reload than consolidated esbuild. The separate diagnostic gate recorded
six native runs on six distinct compiler instances, with no same-instance reuse.
This establishes a narrower warm path, not complete provenance for arbitrary
loaders or a practical performance improvement. External-resolution provenance
must be completed before the representative workload can exercise warm reuse;
removing the conservative guard would invalidate the experiment.

Prefer assessing the supported filesystem boundary over extending a compiler or
building another JavaScript loader. Rspack is a candidate for a native integration;
webpack provides a stable public-API comparison. Neither is selected for production.
The integration must meet these gates before adoption:

1. Complete acquisition and validation, including negative candidates, directory
   changes, same-metadata edits, realpaths, protected aliases and races. Warm
   cache hits must retain the facts originally consumed; incomplete provenance
   requires full recapture, not a current receipt.
2. The existing semantic gate plus owned configuration, runtime conditions,
   generated namespaces, diagnostics and platform behavior. A transform-only
   esbuild loader could preserve some syntax behavior, but would not by itself
   preserve another backend's resolution or linking semantics.
3. Existing transaction, scoped evaluation, per-root consumption, pending-sibling
   and newer-edit accounting, stabilization, recovery and resource bounds. A
   whole-compilation read set alone does not establish selective-root scheduling.
4. Repeatably better startup, reload and memory results on equivalent behavior.
   Measure the complete integration, including filesystem callbacks and exact
   validation; isolated compiler timings are not sufficient.

Do not replace the current implementation with a larger adapter merely to obtain
an attractive API. If the candidate needs compiler patches, reconstructed module
semantics, weaker guarantees or unjustified integration complexity, reject it.
This assessment changes no production behavior and makes no speedup claim.
