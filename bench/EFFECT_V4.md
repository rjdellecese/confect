# Would Effect v4 (effect-smol) reduce the cold-start cost?

Follow-up to `ATTRIBUTION.md`, which found the ~113 ms Confect per-function
cold-start is almost entirely the cost of evaluating the bundled **Effect**
library (Confect's own code is ~3 ms). Effect v4 ("effect-smol") is a ground-up
rewrite that advertises much smaller bundles, so the natural question is how much
it would help.

Because the cost is the library itself, we can answer empirically without
porting Confect: compare the **library-load cost** of the surfaces a Confect
function needs — the runtime (`Effect`/`Layer`) and `Schema` — between Effect
3.21.2 and Effect 4.0.0-beta.78, using the same bundle+cold-eval methodology.

> Reproduce: `node src/effect4.mjs` (installs both versions, needs network).
> The probes assign the **whole namespace object** to a global, a deliberate
> no-tree-shaking upper bound — and the right model for Confect, which pays the
> full price today (it pulls the entire `effect/Schema`; see
> `ATTRIBUTION.md` §5). Note this upper bound comes from escaping the whole
> namespace, **not** from `import * as` syntax, which tree-shakes fine.

## Measured: Effect 3.21.2 vs 4.0.0-beta.78

Top group: whole-namespace probes (assign the namespace object to a global → no
tree-shaking) — an upper bound, and the model that matches what Confect pulls
today. Bottom group: tree-shaken realistic fixtures mirroring effect-smol's own
bundle fixtures.

| surface | v3 min / gz / eval | v4 min / gz / eval | Δbytes | Δeval |
|---|---|---|---|---|
| runtime (`Effect`+`Layer`) | 197 KiB / 65 / **33.4 ms** | 78 KiB / 27 / **19.0 ms** | **−60%** | **−43%** |
| `Schema` (namespace) | 309 KiB / 94 / **52.8 ms** | 340 KiB / 110 / **82.2 ms** | +10% | **+56%** |
| runtime + `Schema` | 374 KiB / 118 / **57.8 ms** | 382 KiB / 125 / **87.2 ms** | +2% | **+51%** |
| `Effect`+`Stream`+`Schema` | 501 KiB / 154 / **68.8 ms** | 447 KiB / 145 / **97.6 ms** | −11% | **+42%** |
| whole `effect` barrel | 938 KiB / 300 / **126.1 ms** | 726 KiB / 233 / **143.8 ms** | −23% | +14% |
| _fixture: basic_ (`Effect.succeed.runFork`) | 128 KiB / 41 / **25.5 ms** | 23 KiB / 8.1 / **12.6 ms** | **−82%** | **−50%** |
| _fixture: schema-decode_ (tree-shaken) | 171 KiB / 54 / **30.5 ms** | 61 KiB / 21 / **66.2 ms** | **−64%** | **+117%** |

## What this means

- **The runtime rewrite is a big, real win.** The Effect/Layer core is **−60%
  bytes and −42% cold-eval** (32.7 → 19.1 ms). Functions whose cost is dominated
  by the runtime benefit directly.
- **But the new Schema is currently *heavier* to evaluate.** In beta.78,
  importing `effect/Schema` costs **+64%** cold-eval (49 → 80 ms) despite similar
  bytes — the redesigned Schema (split across SchemaAST / SchemaParser /
  SchemaGetter / SchemaTransformation / …) does more top-level work at module
  load.
- **For the surface Confect actually needs (runtime + Schema), v4 beta is
  currently ~30 ms *slower* on cold-eval** (57.5 → 89.4 ms), because the Schema
  regression outweighs the runtime win. Confect is validation-heavy, so the
  Schema path dominates its cold start.
- **Bundle size and cold-eval time diverge — again.** v4 ships meaningfully
  fewer bytes (barrel −23%, Effect+Stream+Schema −11%), matching Effect's public
  "smaller bundles" claims, yet **fewer bytes did not mean faster module
  evaluation** here. The thing that counts against the 1 s query/mutation budget
  is eval time, not download size.
- `fast-check` is still pulled into the Schema bundle in **both** v3 and v4.

## Cross-check against effect-smol's own benchmarks

The `effect-smol` repo benchmarks two axes, and my results agree with both — the
divergence is on a third axis it doesn't measure.

1. **Bundle size** — `packages/tools/bundle` Rollup-bundles realistic tree-shaken
   fixtures (e.g. `fixtures/basic.ts` = `Effect.succeed(123).pipe(Effect.runFork)`)
   and reports **gzipped KB** (the `Bundle Size` PR comment). **We agree:** my
   tree-shaken fixtures show v4 dramatically smaller — `basic` **−82%** (8.1 vs
   41 KB gz, ≈ their advertised ~6.3 KB minimal program) and `schema-decode`
   **−64%** (21 vs 54 KB gz). My earlier "+10% Schema bytes" was purely the
   no-tree-shaking `import * as` upper bound; with a real fixture, v4's Schema is
   much smaller, exactly as they claim.
2. **Schema decode throughput** — `packages/effect/benchmark/schema/*` use
   `tinybench` to measure `decodeUnknownExit(...)` **ops/sec** vs zod/valibot/
   arktype. That's steady-state *execution* speed after modules are loaded — a
   different axis from cold start. I didn't measure it and don't contradict it.

3. **Module-evaluation (cold-start) time — neither effect-smol benchmark covers
   this**, and it's exactly where v4 regresses: the tree-shaken `schema-decode`
   fixture is **−64% smaller yet +117% slower to evaluate** (30.5 → 66.2 ms).
   v4's Schema ships far less code but does much more eager work at module import
   (the decode call itself is ~nanoseconds — the 66 ms is module init, not the
   decode). Size went down, throughput is fine, but one-time module-init went up.

**Why this is consistent, not contradictory.** For Effect's primary audience —
long-running Node/Bun/Deno servers — module-init is paid once at process boot and
is irrelevant; bundle size (frontends) and decode throughput (hot paths) are what
matter, and v4 improves both. So it's reasonable both that the Effect team doesn't
benchmark module-init *and* that v4 traded some module-init cost for smaller
bundles, faster decode, and better tree-shaking. Confect is the unusual case:
Convex evaluates each function module on every **isolate cold start**, against a
1 s budget, so module-init is first-class — and that's the one axis v4 currently
worsens for the Schema-dominated Confect path.

## Projection for Confect

If Confect were ported to Effect v4 *as it stands in beta.78*, the per-function
cold-start eval would likely **not** drop — and could rise ~25–30 ms — because
its cost is dominated by the Schema subsystem, which currently evaluates slower
in v4. Offsetting factors: the runtime is much lighter, and v4 folds
`Stream`/platform into core, so Confect's `OrderedQuery → Stream` pull (see
`ATTRIBUTION.md`) gets cheaper.

## Caveats

- **It's a beta.** v4's Schema is young; module-init cost is exactly the kind of
  thing that gets optimized before stable. These numbers are a snapshot of
  beta.78 and should be re-run as v4 progresses (bump the version in
  `src/effect4.mjs`).
- `import * as` is a no-tree-shaking upper bound; a hand-written program using a
  few Schema combinators tree-shakes far smaller (this is how Effect's
  "70 KB → 20 KB" minimal-program figure is measured). Confect can't lean on that
  because `@confect/server` uses a broad Schema surface.
- Cold-eval is a Node `import()` proxy; a Convex isolate snapshots differently.
  The *direction* (runtime better, Schema currently worse) is what to take away.
- Confect can't run on v4 today — it's a major, breaking rewrite; porting
  `@confect/server` is a prerequisite to any real measurement.

## Bottom line

Effect v4's headline is **smaller bundles**, and it delivers that — driven by a
much lighter runtime. But for **cold-start eval specifically**, the win is not
automatic: in the current beta the new Schema is heavier to evaluate, and
Confect's cost is Schema-dominated, so v4 is presently ~neutral-to-worse for
Confect's cold start. The runtime improvement is promising; whether v4 *net*
helps Confect depends on the new Schema's module-init cost being tuned down
before stable. Worth re-measuring at each beta.
