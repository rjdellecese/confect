---
"@confect/core": patch
"@confect/server": patch
"@confect/cli": patch
"@confect/js": patch
"@confect/react": patch
"@confect/test": patch
---

Import Effect from its submodule paths internally to shrink per-function cold-start bundles.

Confect's packages now import Effect modules from their submodule paths (`import * as Schema from "effect/Schema"`) instead of the `"effect"` barrel (`import { Schema } from "effect"`).

### Why

A barrel import of a namespace re-export defeats esbuild's tree-shaking: accessing `Schema.X` from `import { Schema } from "effect"` retains the _entire_ `Schema` namespace, because the bundler can't prune property access on the barrel's `export * as Schema`. So every Convex function's cold-start bundle was pulling all of `effect/Schema` and `effect/Stream` — and, transitively through Schema's `Arbitrary`, `fast-check` — whether the function used them or not.

Importing from the submodule path tree-shakes normally. On a minimal function this cut the bundle esbuild produces by ~54% (the `effect/Schema` module alone by ~75%) and its cold-start module-evaluation time by ~35%, with `fast-check` dropped entirely. This is also the import style Effect v4 recommends, so it's forward-compatible. A `no-restricted-imports` ESLint rule now enforces it across the codebase (type-only imports and `@effect/vitest` are exempt).

No API changes — your existing code keeps working.

### Getting the full win in your own code

This change shrinks the Confect code in every function bundle, but a function's bundle also includes your own `confect/tables/*` and `*.spec.ts` files. esbuild retains the union across all importers, so a single barrel import anywhere in a function's module graph re-pins the whole `effect/Schema` namespace and undoes the reduction. To get the full bundle/cold-start savings, import Effect from its submodule paths in your own Confect files too:

```diff
- import { Schema } from "effect";
+ import * as Schema from "effect/Schema";
```

Bare helpers (`pipe`, `flow`, `identity`) come from `"effect/Function"`.
