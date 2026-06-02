---
"@confect/core": major
"@confect/server": major
"@confect/cli": major
---

Make `FunctionSpec` schemas lazy and resolve group paths impl-side, so a per-function cold-start no longer eagerly builds every other function's argument/return schemas across the project.

### Lazy `FunctionSpec` schemas

`FunctionSpec.publicQuery` / `publicMutation` / `publicAction` / `internalQuery` / `internalMutation` / `internalAction` / `publicNodeAction` / `internalNodeAction` now take their `args`, `returns`, and (optional) `error` as `() => Schema` thunks instead of bare schemas. The resulting provenance exposes `args` / `returns` / `error` as sync lazy memoised getters (the same pattern `Table.make` already uses for `Fields` / `Doc` / `tableDefinition`): the schema is built on first access and then cached as a plain data property.

Because the codegen-emitted `_generated/spec.ts` is imported transitively by every per-group function bundle, building it previously ran `Schema.Struct(...)` / `Schema.Array(...)` for every function in the whole project at module load. Now that work is deferred to the first invocation that actually compiles validators or runs a codec, so a function's cold-start cost scales with the functions it touches rather than the size of the project.

Migration: wrap each `args` / `returns` / `error` value in `() =>`.

```diff
  FunctionSpec.publicQuery({
    name: "list",
-   args: Schema.Struct({}),
-   returns: Schema.Array(notes.Doc),
+   args: () => Schema.Struct({}),
+   returns: () => Schema.Array(notes.Doc),
  })
```

### Impl-side group-path resolution

`FunctionImpl.make` and `GroupImpl.make` no longer resolve a project-wide dot-path from `api.spec`. Each function registers under a flat, single-segment key (its own name) into a fresh, isolated `Registry` that `RegisteredFunctions.buildForGroup` (and the CLI's impl validation) provides per group. As a result:

- `Spec#addPath`, the `Spec#paths` map, and `Api.resolveGroupPathUnsafe` are removed. The codegen-emitted `_generated/spec.ts` / `_generated/nodeSpec.ts` no longer contain a `.addPath(...)` registration chain (the `.addAt(...)` / `.addGroupAt(...)` assembly tree, which `Refs.make` consumes, is unchanged).
- `GroupImpl<GroupPath, FinalizationStatus>` and `FunctionImpl<GroupPath, FunctionName>` drop their group-path type parameter, becoming `GroupImpl<FinalizationStatus>` and `FunctionImpl<FunctionName>`. Their runtime service tags are keyed only by finalization status / function name.

Author-facing `*.spec.ts` and `*.impl.ts` code is otherwise unchanged: `FunctionImpl.make(api, spec, name, handler)` and `GroupImpl.make(api, spec)` keep their signatures, and `api` remains as a type-level carrier (for handler-service inference) plus a runtime carrier for `databaseSchema`. Re-run `confect codegen` to regenerate `_generated/spec.ts` / `_generated/nodeSpec.ts`. Hand-rolled tests that built a `Spec` via `.addPath(group, "dot.path")` should drop those calls.
