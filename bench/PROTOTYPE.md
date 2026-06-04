# Prototype: submodule imports to cut Confect cold-start cost

Follow-up to `ATTRIBUTION.md` §5, which found Confect's function bundle pulls the
**entire** `effect/Schema` (and `Stream`) namespace because `@confect/server` and
user table files import them from the `"effect"` barrel, which esbuild can't
tree-shake. This prototype switches those to submodule imports
(`import * as Schema from "effect/Schema"`) — the style Effect v4 recommends — and
measures the real effect on a Confect function's cold start.

## What changed

- `node bench/src/importcodemod.mjs` rewrites barrel Effect imports →
  per-namespace submodule imports across `@confect/server` and `@confect/core`
  (43 imports), then `pnpm --filter @confect/core --filter @confect/server build`.
- The benchmark's synthetic table/spec/impl templates (`generate.mjs`) likewise
  emit submodule imports — modelling a user who follows the same convention.
- Correctness: `pnpm test:core` and `pnpm test:server` both pass (368 server
  tests, no type errors).

## Results (minimal G1/F1/T1 function, `node src/measure_one.mjs`)

| scenario | bundle (min) | `Schema.js` | Stream/Chan/Sink | fast-check | cold-eval |
|---|---|---|---|---|---|
| **A. baseline** — all barrel imports | 589 KiB | 152.9 KiB | 211 KiB | yes | **115.2 ms** |
| **C. library only** — server+core fixed, user tables still barrel | 396 KiB | 152.7 KiB | 63.5 KiB | yes | **93.3 ms** |
| **B. full** — library + user tables on submodule | **270 KiB** | **37.8 KiB** | 63.5 KiB | no | **75.0 ms** |

- **Library-only (C), unconditional — users change nothing:** −33% bundle,
  **−22 ms eval (−19%)**. This is the `Stream`/`Channel`/`Sink` (211→63 KiB)
  shed by fixing `OrderedQuery.ts`'s barrel `Stream` import. Schema stays full
  because one user-side barrel `Schema` importer still spoils it.
- **Full (B) — users also use `import * as Schema from "effect/Schema"`:**
  **−54% bundle, −40 ms eval (−35%)**, Schema 152.9→37.8 KiB (−75%), and
  fast-check drops out entirely.

This is much larger than the ~13 ms estimated earlier from stubbing
Stream/STM/fast-check — because that stub couldn't touch **Schema** (the barrel
pinned all 152.9 KiB). Fixing the imports lets Schema itself tree-shake 75%, and
that *does* convert to eval time. (Bytes still aren't perfectly proportional to
eval — but here both moved a lot.)

## Recommendation

1. **Land the `@confect/server` + `@confect/core` submodule-import refactor.** It's
   an unconditional win for every Confect user (−33% bundle, ~−22 ms cold-eval),
   passes the test suites, and matches Effect v4's recommended import style
   (forward-compatible with a future v4 port). The diff is mechanical; it can be
   scoped to just the heavy namespaces (`Schema`, `Stream`, `ParseResult`,
   `Chunk`, `Arbitrary`/`FastCheck` chain) if a smaller diff is preferred.
2. **Recommend submodule imports in user `confect/tables/*` and `*.spec.ts`
   files** (docs/examples): `import * as Schema from "effect/Schema"`. This
   unlocks the Schema tree-shaking for the full −54% bundle / −40 ms result.
   Note the **one-spoiler rule**: a single `import { Schema } from "effect"`
   anywhere in a function's module graph re-pulls the whole namespace, so this
   needs to be a consistent convention, not a per-file tweak.

## Caveats

- Cold-eval is a Node `import()` proxy; absolute ms differ from a Convex isolate,
  but the relative win (−35%) is the signal. Against the 1 s query/mutation
  budget, 115 → 75 ms per cold isolate is meaningful.
- The library refactor is broad (all namespace imports, not just Schema/Stream).
  Tests pass, but a maintainer may want to review/scope the diff before landing.
- Reproduce A vs B: `git stash` the refactor (or revert with `git checkout
  packages/{server,core}/src`) and rebuild for A; apply `importcodemod.mjs` +
  rebuild for B; `node src/measure_one.mjs work/_attrib` after regenerating.
