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

The two `*Boundary.test.ts` integration suites run with the private test command.
They check native engine capabilities and limitations; passing them is not a
claim that either engine satisfies the complete backend contract.

**The Vite gate currently fails. Do not benchmark that candidate as equivalent to
the existing compiler.** Passing the unit suite does not qualify the backend.

## Rspack cold-compilation experiment

`gate:rspack` runs the same fifteen fixtures, expected values, rejection control
and ten-second budgets as `gate`. It uses the existing compiler as the oracle
and fresh child processes for both evaluations. **All fifteen oracle controls
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
fresh evaluation and comment-only invalidation. Thirty filesystem tests exercise
capture, replay, sealing and read-safety cases.

**No performance comparison or production switch has been made.** The adapter
does not yet reproduce production third-party externalization, generated-module
ownership, active Yarn semantics, full diagnostics or runtime-condition coverage.
The existing Watch/receipt/pending-edit/recovery state machines are not integrated,
and a whole-build read set is not proof of selective-root scheduling. Windows
and a portable equivalent of the read guard remain unqualified. The result keeps
Rspack viable for further qualification; it does not establish that the complete
integration is simpler or faster than the current compiler.

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

With Node 24.21.0, esbuild 0.28.2, and Vite 8.3.4, all fifteen oracle fixtures
match their expected outcomes. Nine prototype cases match: inherited aliases,
live bindings, a cyclic graph, literal dynamic imports, importer-relative
identities, ordinary JSON attributes, the oracle's TypeScript-attribute
behavior, CommonJS default imports, Node builtins, and lazy Confect schemas
(some cases exercise more than one behavior).

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
