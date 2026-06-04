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
> Identical `import * as` probes, esbuild-minified, median of 31 fresh-process
> evals. `import * as` is a worst-case (no tree-shaking) — but it's the right
> model for Confect, whose `SchemaToValidator` pulls a broad Schema surface.

## Measured: Effect 3.21.2 vs 4.0.0-beta.78

| surface | v3 min / gz / eval | v4 min / gz / eval | Δbytes | Δeval |
|---|---|---|---|---|
| runtime (`Effect`+`Layer`) | 197 KiB / 65 / **32.7 ms** | 78 KiB / 27 / **19.1 ms** | **−60%** | **−42%** |
| `Schema` | 309 KiB / 94 / **49.1 ms** | 340 KiB / 110 / **80.4 ms** | +10% | **+64%** |
| runtime + `Schema` | 374 KiB / 118 / **57.5 ms** | 382 KiB / 125 / **89.4 ms** | +2% | **+56%** |
| `Effect`+`Stream`+`Schema` | 501 KiB / 154 / **70.1 ms** | 447 KiB / 145 / **96.1 ms** | −11% | **+37%** |
| whole `effect` barrel | 938 KiB / 300 / **120.7 ms** | 726 KiB / 233 / **136.5 ms** | −23% | +13% |

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
