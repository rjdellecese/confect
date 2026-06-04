# Where the Confect per-function cold-start cost comes from

Follow-up to `RESULTS.md`. The headline benchmark showed Confect adds ~**95–113 ms**
of per-function cold-start (module-evaluation) cost over vanilla Convex. This
breaks that number down and assesses what is reducible.

> **Reproduce:** `node src/attribute.mjs` (layer deltas), `node src/profile.mjs`
> (byte composition + profile), `node src/reduction.mjs` (best-case stubbing).
> Numbers below are medians on a minimal G1/F1/T1 Confect function (so group/
> table scaling is out of the picture); absolute ms vary by machine.

## 1. Layer decomposition (bundled, fresh-process eval)

| layer | bundle | cold eval |
|---|---|---|
| Node + import floor | 0 KiB | ~0.5 ms |
| `+ convex` (externals; the vanilla cost) | 0.1 KiB | ~19 ms |
| real Confect function entry | 589 KiB | ~113 ms |
| — Effect **runtime** only (`Effect`/`Layer`/`Context`/`Ref`/`Runtime`) | 206 KiB | ~34 ms |
| — Effect **Schema** subsystem (`Schema`/`ParseResult`/`SchemaAST`) | 314 KiB | ~50 ms |
| — whole `effect` barrel (upper bound) | 938 KiB | ~121 ms |

**The cost is almost entirely the bundled `effect` library, not Confect.** By
output bytes the 589 KiB function bundle is:

| share | module |
|---|---|
| ~11% | `effect/Schema` |
| ~9% | `effect/internal/stream` |
| ~5% | `effect/internal/fiberRuntime` |
| ~4.5% | `effect/SchemaAST` |
| ~4.4% | `effect/internal/channel` |
| ~3% each | `effect/ParseResult`, `internal/core`, `internal/stm` |
| **~2.8%** | **`@confect/server` (all of Confect's own code)** |
| ~5% | `fast-check` (transitively, via effect) |
| … | the rest is more `effect/*` |

`@confect/server`'s own code is **~2.8% / ~38 KiB / ~3 ms**. Confect is a thin
wrapper; the cold-start cost is the cost of evaluating Effect + Effect Schema.

## 2. What pulls the heavy pieces

Traced via the esbuild metafile (`src/profile.mjs`):

- **Schema / SchemaAST / ParseResult (~19%)** — required: Confect compiles each
  function's Effect schema into a Convex validator (`SchemaToValidator`). v9 made
  schema *construction* lazy (first invocation), but the Schema *module* is still
  statically imported, so it's evaluated at cold start.
- **Stream / Channel / Sink (~15%, ~208 KiB)** — pulled by
  `@confect/server/OrderedQuery.ts`, which does `import { … Stream } from "effect"`
  at module top level. **Every** query/mutation bundle pays for the streaming
  machinery even if it never streams.
- **STM / TPubSub (~3%)** and **fast-check (~5%)** — pulled through effect's
  barrel interconnection (`effect/index.js` re-exports `FastCheck`, `TPubSub`, …),
  reachable from the generated impl's `import { Effect, Layer } from "effect"`.
- `@effect/platform` (HTTP/Command/FileSystem, reached via `@confect/server`'s
  `HttpApi` re-export) **is correctly tree-shaken out** of query/mutation bundles
  — both `@confect/server` and `effect` set `sideEffects: false`. So that path is
  *not* a problem.

## 3. How much is reducible

Best case from stubbing out Stream/Channel/Sink/PubSub/STM/fast-check
(`src/reduction.mjs`):

| | bundle | cold eval |
|---|---|---|
| baseline | 589 KiB | 113.7 ms |
| stubbed | 414 KiB | 100.5 ms |
| **saved** | **−175 KiB (30%)** | **−13 ms (12%)** |

Key insight: **bundle size and eval time are not proportional.** Stream/STM/
fast-check are 30% of the *bytes* but only ~12% of the *eval time* — they're
large but cheap to evaluate (mostly definitions, little top-level work). The
remaining ~100 ms is core Effect runtime + Schema module initialization, which
has real top-level cost and is inherent to building on Effect.

## 4. Recommendations

Ordered by leverage:

1. **Decouple `Stream` from the query hot path.** `OrderedQuery.ts` imports
   `effect/Stream` at top level, putting ~208 KiB (and the Channel/Sink/STM it
   drags) in every query/mutation bundle. If the streaming API were behind a
   dynamic `import()` or split into a separate module that only `.stream()`
   pulls, non-streaming functions would shed ~15% of bytes (~13 ms with the
   other removable modules). Concrete, Confect-side, low-risk.
2. **Prefer deep effect imports over the barrel in generated code.** The
   generated `*.impl.ts` (and `@confect/server`) import from `"effect"`; the
   barrel re-export hub is what makes `FastCheck`/`TPubSub` reachable. Importing
   `Effect`/`Layer` from their submodule paths can let the bundler drop more.
   (Effect already sets `sideEffects:false`, so the win here is modest but free.)
3. **Accept the floor.** ~80–100 ms is evaluating the Effect runtime + Effect
   Schema, which Confect needs and cannot remove without dropping Effect. The
   only structural wins are upstream (lighter Effect module init) or a different
   validation strategy that doesn't load `effect/Schema` at cold start.

## 5. Important context

- **This is a cold-start cost, paid once per V8 isolate, not per request.**
  Convex reuses warm isolates, so most invocations don't pay it. Against the 1 s
  query/mutation budget it matters only on the first call into a fresh isolate.
- The ~113 ms is a **Node `import()` proxy**; a Convex isolate parses/evaluates
  the same modules but with its own snapshotting, so the production number will
  differ. The *attribution* (Effect/Schema dominates, Confect's own code is
  ~3 ms) holds regardless.
