---
"@confect/core": major
"@confect/server": major
"@confect/cli": major
---

Reduce per-function cold-start cost: make `FunctionSpec` schemas lazy and keep each Convex function's bundle scoped to its own group.

Previously, loading a single Convex function still paid for the whole project — importing the codegen-assembled `_generated/spec.ts` ran `Schema.Struct(...)` / `Schema.Array(...)` for every function at module load, and each per-function bundle transitively imported `_generated/api.ts` → `_generated/spec.ts` (every spec). A function's cold-start cost now scales with its own group rather than the size of the project.

### Lazy `FunctionSpec` schemas

`FunctionSpec.*` (`publicQuery` / `internalQuery` / `publicMutation` / `internalMutation` / `publicAction` / `internalAction` / `publicNodeAction` / `internalNodeAction`) takes `args`, `returns`, and (optional) `error` as `() => Schema` thunks instead of bare schemas. The resulting provenance exposes them as sync lazy memoised getters (the same pattern `Table.make` uses), so importing `_generated/spec.ts` builds no schemas — construction is deferred to the first invocation that compiles validators or runs a codec.

Migration — wrap each schema in `() =>`:

```diff
  FunctionSpec.publicQuery({
    name: "list",
-   args: Schema.Struct({}),
-   returns: Schema.Array(notes.Doc),
+   args: () => Schema.Struct({}),
+   returns: () => Schema.Array(notes.Doc),
  })
```

### Impls take the `DatabaseSchema`, and group paths resolve impl-side

`FunctionImpl.make` and `GroupImpl.make` now take the runtime `DatabaseSchema` (the default export of `_generated/schema.ts`) as their first argument instead of the whole `Api`. The handler's ctx-service types only ever depended on the database schema, and switching impls to import `_generated/schema` instead of `_generated/api` removes `_generated/spec.ts` (and the function specs it transitively imports) from every per-function bundle.

Each function also registers under a flat, single-segment key into a fresh, isolated `Registry` provided per group by `RegisteredFunctions.buildForGroup` (and the CLI's impl validation), so no group-path lookup against `api.spec` is needed. As a result `Spec#addPath`, `Spec#paths`, and `Api.resolveGroupPathUnsafe` are removed; `GroupImpl` / `FunctionImpl` drop their group-path type parameter; and the codegen-emitted `_generated/spec.ts` / `nodeSpec.ts` no longer contain a `.addPath(...)` chain (the `.addAt(...)` / `.addGroupAt(...)` assembly tree that `Refs.make` consumes is unchanged).

Migration — in each `*.impl.ts`, import the database schema and pass it where you passed `api` / `nodeApi`:

```diff
- import api from "../_generated/api";        // (or nodeApi from "../_generated/nodeApi")
+ import databaseSchema from "../_generated/schema";

- const insert = FunctionImpl.make(api, notes, "insert", handler);
+ const insert = FunctionImpl.make(databaseSchema, notes, "insert", handler);

- export default GroupImpl.make(api, notes).pipe(Layer.provide(insert), GroupImpl.finalize);
+ export default GroupImpl.make(databaseSchema, notes).pipe(Layer.provide(insert), GroupImpl.finalize);
```

Node impls migrate identically (from `nodeApi` to the same `_generated/schema`); only their specs differ (`GroupSpec.makeNode()`). Hand-rolled tests that built a `Spec` via `.addPath(group, "dot.path")` should drop those calls.

### `buildForGroup` and the generated registries

`RegisteredFunctions.buildForGroup` takes the `DatabaseSchema` value plus the group's own `GroupSpec` as a single type argument (`buildForGroup<typeof groupSpec>(…)`, returning `RegisteredFunctionsForGroupSpec<Group>`); the `api` / `groupPath` parameters and the `ForGroupPath` dot-path navigation are gone. `RegisteredConvexFunction.make` / `RegisteredNodeFunction.make` take the `DatabaseSchema` rather than the `Api`. Each `_generated/registeredFunctions/{path}.ts` imports the runtime schema and references its group's leaf spec **type-only** (`typeof import("…/{group}.spec")["default"]`), so it never imports a spec module at runtime.

### `_generated/api.ts` / `nodeApi.ts` are no longer emitted

Nothing imports them anymore, so `confect codegen` no longer emits `_generated/api.ts` / `_generated/nodeApi.ts` and deletes any copies left over from earlier versions. If you referenced the generated `Api` value directly, construct it with `Api.make(schema, spec)` from `@confect/server` and `@confect/core`.

### Net effect

A function's `convex/{path}.ts` bundle now imports only its own group's registry → its own `.impl` + `_generated/schema` (table schemas, built lazily) + its own group's spec. No `_generated/api.ts`, no project-wide `_generated/spec.ts`, and no sibling-group impls/specs. Re-run `confect codegen` after upgrading.
