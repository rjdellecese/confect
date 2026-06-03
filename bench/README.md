# @confect/bench — per-function cold-start benchmark

Quantifies the **per-function cold-start overhead** that Confect v9 adds over a
**vanilla Convex** project, and whether that overhead stays flat as a project
grows. This is the harness used to evaluate the impact of the v9 changes
(lazy `FunctionSpec` schemas, per-group bundle isolation, lazy per-table
schemas).

## What it measures

Convex deploys each `convex/{path}.ts` module as an entry point and evaluates
its bundle on a cold isolate. We proxy "per-function startup time" with:

- **(A) Per-function bundle size** — each entry bundled with esbuild the way
  Convex bundles function modules: ESM, `convex` + Node built-ins external,
  everything else (incl. `@confect/*` and `effect`) inlined. See
  `src/esbuildBundle.mjs`.
- **(B) Per-function module-eval time** — the bundled entry is `import()`-ed in
  a **fresh Node process** (`src/evalChild.mjs`), timing top-level evaluation.
  Median of `REPS_EVAL` reps after `WARMUP` discards.

The **baseline** is a vanilla Convex app (`queryGeneric` + `v.*` validators); the
**comparison** is the *same logical workload* authored with Confect v9. Both are
emitted by one generator (`src/generate.mjs`) from a single source of truth for
schema shapes (`src/shapes.mjs`), so any difference is the framework overhead,
not a different workload.

## Sweep

Three orthogonal scaling axes (`src/config.mjs`), each isolating one dimension of
"project size":

- **A. groups** `G ∈ {1,5,20,50}` (tables=5, shape=medium) — the headline v9
  claim: per-function cost should scale with a function's own group, not the
  whole project, so these should stay flat.
- **B. tables** `T ∈ {1,5,20,50}` (groups=5, shape=medium) — Confect entries
  import the runtime `_generated/schema` (all tables, built lazily); vanilla
  function modules don't import the schema at all.
- **C. complexity** `{small,medium,large}` (groups=5, tables=5) — with lazy
  schemas, eval time should stay ~flat across complexity even as bundle bytes grow.

## Run

From the repo root, with packages built (bundles consume `dist/`, not `src/`):

```bash
pnpm install
pnpm build
pnpm --filter @confect/bench bench     # writes bench/RESULTS.md + bench/results.csv
```

Re-render the report from the last raw run without re-measuring:

```bash
pnpm --filter @confect/bench report
```

Outputs:

- `bench/RESULTS.md`, `bench/results.csv` — committed summary + raw rows.
- `bench/out/` — `results.json` and per-cell esbuild metafiles (gitignored).
- `bench/work/` — generated throwaway apps (gitignored).

## Faithfulness & caveats

- **Eval-in-Node vs V8 isolate.** Metric B runs in Node, not a Convex isolate, so
  absolute ms differ from production; the *relative* and *scaling* story is what
  matters. Bundles use `platform:"node"` with Node built-ins external for
  consistency with the Node eval host.
- **Vanilla function source.** Functions import `queryGeneric` from `convex/server`
  directly rather than the generated `./_generated/server` re-export; since
  `_generated/server` only re-exports `queryGeneric` and imports the (external)
  `convex/server`, the bundle is equivalent. This keeps the vanilla path fully
  offline (no `convex codegen`).
- **Isolation check.** Each cell saves one esbuild metafile to `out/metafiles/`;
  a Confect entry's inputs include only its own group's `*.impl`/`*.spec`, never a
  sibling group's — the per-group bundle isolation, verified.
- **Real-backend cross-check.** `src/backendCheck.mjs` drives a real local Convex
  backend for one representative cell and scrapes Convex's own reported bundle
  sizes, to validate the esbuild proxy. It needs the Convex local backend (binary
  download / network); when unavailable, the esbuild proxy is the reproducible
  primary and the cross-check is skipped.
