# Compiler backend contract and capability assessment

## Decision

Keep Confect's owned configuration, revision, publication and recovery model.
Keep a mature compiler responsible for module semantics. Do not promote the
thin Vite adapter, replace native resolution with a Confect resolver, or equate
watcher silence with freshness.

The next implementation target is an **engine-owned refresh/prepare boundary**:
refresh the native graph and validate a previously prepared revision without
necessarily linking and generating artifacts again. A changed graph still needs
normal semantic preparation before evaluation. Bundled output remains valid;
incremental work does not require an unbundled runtime.

The current public APIs do not yet establish this complete boundary. esbuild has
a useful resolver-only primitive but no complete validation receipt. Rolldown
has a real experimental scan API, but not the entire persistent, observable,
owned-configuration boundary. Neither finding justifies a production switch.

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

The proposed operations are a semantic contract, not an implemented public API:

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

## Next implementation decision

Prefer a focused native-boundary feasibility change over a new Confect loader:

1. Explore an esbuild refresh/capture extension that retains the native scan,
   exposes complete observation provenance, and permits preparation from that
   capture. Preserve the existing configuration handoff and module semantics.
   This requires an upstream-capability discussion or an explicitly isolated
   feasibility branch; it is not implementable by pretending the current public
   plugin callbacks already provide all the required facts.
   A feasibility patch is not a commitment to maintaining a permanent private
   compiler fork; an upstream-supported, sustainable surface is part of the
   backend selection criterion.
2. Require the glob, same-metadata, candidate-kind, realpath and acquisition-race
   cases to pass before accepting a current receipt. Preserve the existing
   receipt, recovery, protected-file and evaluation-isolation suites. No current
   production test or operation budget is changed by this assessment.
3. Only then measure unchanged refresh, a one-group edit, shared-helper edits,
   configuration restart, cold start and memory. Distinguish read/scan, linking,
   generation and evaluation costs. Do not promise that the boundary removes
   the entire observed regression.
4. If obtaining or maintaining this capability in esbuild is not sustainable,
   evaluate Rolldown against the same contract, including owned configuration
   and API stability. Its scan API makes it worth investigating, not a qualified
   replacement today.

The decision is to keep the semantic engine replaceable while keeping one
authority for each fact. This work adds evidence and a contract only; production
validation is not skipped, and no backend switch or performance claim is made.
