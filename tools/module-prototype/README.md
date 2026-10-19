# Module-oriented compiler prototype

This private workspace package evaluates a compiler architecture. It is not
published, used by `confect dev` or `confect codegen`, or a production fallback.
The existing compiler remains the compatibility oracle.

See [the backend contract and capability assessment](./BACKEND_CONTRACT.md) for
the subsequent native validation-boundary investigation. It distinguishes
freshness validation from semantic preparation and records real esbuild and
Rolldown probes; it does not promote the adapter below.

## Run the checks

From the repository root, with the workspace dependencies and packages built:

```sh
pnpm --filter module-prototype typecheck
pnpm --filter module-prototype test
pnpm --filter module-prototype gate
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

**The gate currently fails. Do not benchmark this candidate as equivalent to
the existing compiler.** Passing the unit suite does not qualify the backend.

## What the prototype does

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

## Compatibility result

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

## Architectural consequence

Do not promote this adapter or infer a speedup from its smaller compilation
units. A replacement needs a complete loader/resolution/linking contract before
performance comparison. esbuild already caches parsed syntax; the performance
hypothesis is avoiding broader graph and output work, not merely caching parses.
The preserved tests and gate make the remaining compatibility cost explicit.
