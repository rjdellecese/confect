# Cold-start benchmark: vanilla Convex vs Confect v9

Per-function cold-start cost, proxied by (A) the esbuild bundle size of each
`convex/{path}.ts` entry (externalizing `convex` + Node built-ins, the way
Convex bundles function modules) and (B) the wall-clock time to evaluate that
bundle's module top-level in a fresh Node process. Each number is the mean
over the sampled, structurally-identical functions in a cell.

The baseline is a **vanilla Convex** project (plain `queryGeneric` + `v.*`
validators). The comparison is the **same logical workload** authored with
**Confect v9**. "Confect overhead" = Confect − vanilla.

## Headline findings

- **Per-group bundle isolation (the core v9 fix) works.** Confect's
  per-function bundle is **flat** across G = 1→50
  function groups (593.2 KiB → 593.2 KiB),
  and eval time is flat too (133.91 ms → 140.84 ms).
  A function's cold-start cost no longer grows with the size of the project.
- **Lazy table schemas work.** Adding tables grows the bundle only slightly
  (~0.2 KiB/table, since every function imports the runtime
  `_generated/schema`) and leaves eval time flat
  (138.54 ms → 139.50 ms across T = 1→50) —
  importing all tables doesn't build their schemas.
- **Lazy function schemas mostly work.** Across complexity, eval rises only
  modestly (129.11 ms → 156.89 ms);
  bundle bytes grow because schema source is present, not built at load.
- **The residual overhead is a fixed per-function cost**, not a scaling one:
  ~589.6 KiB and
  ~112.97 ms per function vs vanilla —
  the bundled `effect` + `@confect/server` runtime. v9 made this constant
  per function rather than something that compounds with project size.

## A. Scaling with number of function groups (tables=5, shape=medium)

Tests the headline v9 claim: a function's cold-start bundle should scale with
its own group, **not** the whole project — so these rows should stay flat as G grows.

### Groups sweep

| groups (G) | 1 | 5 | 20 | 50 |
|---|---|---|---|---|
| vanilla bundle | 3.6 KiB | 3.6 KiB | 3.6 KiB | 3.6 KiB |
| confect bundle | 593.2 KiB | 593.2 KiB | 593.2 KiB | 593.2 KiB |
| **Confect overhead** | 589.6 KiB | 589.6 KiB | 589.6 KiB | 589.6 KiB |

| vanilla eval | 21.25 ms | 20.94 ms | 22.13 ms | 21.74 ms |
| confect eval | 133.91 ms | 136.51 ms | 136.94 ms | 140.84 ms |
| **Confect overhead** | 112.66 ms | 115.57 ms | 114.80 ms | 119.09 ms |

## B. Scaling with number of tables (groups=5, shape=medium)

Confect function bundles import the runtime `_generated/schema` (all tables,
built lazily); vanilla function modules don't import the schema at all.

### Tables sweep

| tables (T) | 1 | 5 | 20 | 50 |
|---|---|---|---|---|
| vanilla bundle | 3.6 KiB | 3.6 KiB | 3.6 KiB | 3.6 KiB |
| confect bundle | 592.3 KiB | 593.2 KiB | 596.7 KiB | 603.8 KiB |
| **Confect overhead** | 588.7 KiB | 589.6 KiB | 593.1 KiB | 600.2 KiB |

| vanilla eval | 20.67 ms | 20.94 ms | 20.75 ms | 21.13 ms |
| confect eval | 138.54 ms | 136.51 ms | 136.78 ms | 139.50 ms |
| **Confect overhead** | 117.88 ms | 115.57 ms | 116.03 ms | 118.37 ms |

## C. Scaling with Effect-schema complexity (groups=5, tables=5)

If v9's lazy schemas work, **eval** time should stay roughly flat across
complexity (schemas aren't built at module load); bundle bytes still grow
because the schema source is present.

### Complexity sweep

| complexity | small | medium | large |
|---|---|---|---|
| vanilla bundle | 1.0 KiB | 3.6 KiB | 11.9 KiB |
| confect bundle | 590.3 KiB | 593.2 KiB | 602.4 KiB |
| **Confect overhead** | 589.3 KiB | 589.6 KiB | 590.5 KiB |

| vanilla eval | 19.93 ms | 20.94 ms | 22.27 ms |
| confect eval | 129.11 ms | 136.51 ms | 156.89 ms |
| **Confect overhead** | 109.18 ms | 115.57 ms | 134.62 ms |

## Cross-check: Convex's own bundler (offline)

Per-function bundle size from **Convex's actual deployment bundler**
(`convex/dist/.../bundler`, `platform: "browser"` = the isolate environment,
unminified) on the `G5/F8/T5/medium` cell. Convex's isolate bundler inlines
the `convex` package too (the esbuild proxy externalizes it), so absolute
bytes are larger than the proxy — but the vanilla-vs-Confect ratio confirms
the proxy's finding.

| | vanilla | Confect | ratio |
|---|---|---|---|
| Convex bundler (browser, raw) | 58.5 KiB | 1089.1 KiB | 18.6× |

## Raw cell aggregates

| version | G | F | T | complexity | bundle(min) | bundle(raw) | eval |
|---|---|---|---|---|---|---|---|
| confect | 1 | 8 | 5 | medium | 593.2 KiB | 1423.2 KiB | 133.91 ms |
| confect | 5 | 8 | 1 | medium | 592.3 KiB | 1420.8 KiB | 138.54 ms |
| confect | 5 | 8 | 5 | large | 602.4 KiB | 1445.5 KiB | 156.89 ms |
| confect | 5 | 8 | 5 | medium | 593.2 KiB | 1423.2 KiB | 136.51 ms |
| confect | 5 | 8 | 5 | small | 590.3 KiB | 1416.5 KiB | 129.11 ms |
| confect | 5 | 8 | 20 | medium | 596.7 KiB | 1432.5 KiB | 136.78 ms |
| confect | 5 | 8 | 50 | medium | 603.8 KiB | 1451.1 KiB | 139.50 ms |
| confect | 20 | 8 | 5 | medium | 593.2 KiB | 1423.2 KiB | 136.94 ms |
| confect | 50 | 8 | 5 | medium | 593.2 KiB | 1423.2 KiB | 140.84 ms |
| vanilla | 1 | 8 | 5 | medium | 3.6 KiB | 5.0 KiB | 21.25 ms |
| vanilla | 5 | 8 | 1 | medium | 3.6 KiB | 5.0 KiB | 20.67 ms |
| vanilla | 5 | 8 | 5 | large | 11.9 KiB | 16.4 KiB | 22.27 ms |
| vanilla | 5 | 8 | 5 | medium | 3.6 KiB | 5.0 KiB | 20.94 ms |
| vanilla | 5 | 8 | 5 | small | 1.0 KiB | 1.4 KiB | 19.93 ms |
| vanilla | 5 | 8 | 20 | medium | 3.6 KiB | 5.0 KiB | 20.75 ms |
| vanilla | 5 | 8 | 50 | medium | 3.6 KiB | 5.0 KiB | 21.13 ms |
| vanilla | 20 | 8 | 5 | medium | 3.6 KiB | 5.0 KiB | 22.13 ms |
| vanilla | 50 | 8 | 5 | medium | 3.6 KiB | 5.0 KiB | 21.74 ms |
