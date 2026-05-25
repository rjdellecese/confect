---
"@confect/core": major
"@confect/server": major
"@confect/cli": major
---

Derive Confect function paths from the filesystem layout of `confect/`. Each group lives in a colocated `*.spec.ts`/`*.impl.ts` pair, and the group's name is its path within `confect/` (file stem for top-level groups, dot-joined directory path for nested groups). See [Project Structure](https://confect.dev/concepts/project-structure), [File Naming Conventions](https://confect.dev/concepts/file-naming-conventions), and [The Spec/Impl Model](https://confect.dev/concepts/spec-impl-model) for the current model.

Each `*.spec.ts` default-exports its `GroupSpec`. Each `*.impl.ts` default-imports its sibling spec, builds its `GroupImpl`, and default-exports the result of `GroupImpl.finalize`. Named co-exports on `*.spec.ts` (such as error classes) remain allowed.

### Why

The previous model assembled every group's impl into a single root `confect/impl.ts` (plus `confect/nodeImpl.ts`), which `confect codegen` emitted as the aggregate `_generated/registeredFunctions.ts`. Every generated `convex/` module — one per Convex function — imported from that aggregate, so loading any single query, mutation, or action transitively loaded the impl module of every other Convex function in the project, along with all of their dependencies. For large projects this inflated each function's bundle and added meaningful cold-start cost on Convex.

Splitting impl across colocated `*.impl.ts` files is the vehicle for fixing that. With this change, `confect codegen` emits one `_generated/registeredFunctions/{path}.ts` per group, and each generated `convex/` module imports only its own group's per-group registry — which in turn imports only its own sibling `.impl.ts`. A Convex function's cold-start bundle now scales with its own group's impl rather than with the size of the whole project.

### Breaking changes

- `GroupSpec.make()` and `GroupSpec.makeNode()` no longer take a name argument; the group name is derived from the spec file's path within `confect/`.
- `FunctionImpl.make(api, groupSpec, fn, handler)` and `GroupImpl.make(api, groupSpec)` now take the imported sibling spec object as their second argument instead of a dot-path string.
- Every `GroupImpl` pipeline must end with `GroupImpl.finalize`, which only typechecks once every function declared by the spec has a corresponding `FunctionImpl` provided to the group layer. `GroupImpl.finalize` snapshots the names of every registered function onto the produced `Finalized` `GroupImpl` service value, and `confect codegen` reads those names to verify per-function coverage against the spec at runtime.
- The previously-exported `Impl.make` and `Impl.finalize` (used by the old root `impl.ts`/`nodeImpl.ts` files) are removed. Per-group completeness is now enforced by `GroupImpl.finalize`.
- Root `confect/spec.ts`, `confect/impl.ts`, `confect/nodeSpec.ts`, `confect/nodeImpl.ts`, and any parent aggregator `*.spec.ts`/`*.impl.ts` files are no longer used. `confect codegen` deletes any of these on upgrade, along with the stale `_generated/registeredFunctions.ts` and `_generated/nodeRegisteredFunctions.ts`.
- Every module under `convex/` is re-emitted to import from `_generated/registeredFunctions/{path}` instead of the previous aggregate file. Users who commit `convex/` to source control should expect a full rewrite of that directory on first codegen.

### Migration

1. For each existing group, create a colocated `confect/{path}.spec.ts` and `confect/{path}.impl.ts` pair (under a subdirectory for nested groups).
   - In each spec, call `GroupSpec.make()` (or `GroupSpec.makeNode()`) without a name and `export default` the result.
   - In each impl, default-import the sibling spec (e.g. `import notes from "./notes.spec"`), pass it to `FunctionImpl.make`/`GroupImpl.make` in place of the previous dot-path string, append `GroupImpl.finalize` to the pipeline, and `export default` the resulting `GroupImpl` layer:
     ```ts
     export default GroupImpl.make(api, notes).pipe(
       Layer.provide(list),
       Layer.provide(insert),
       GroupImpl.finalize,
     );
     ```
2. Delete root `confect/spec.ts`, `confect/impl.ts`, `confect/nodeSpec.ts`, `confect/nodeImpl.ts`, and any parent aggregator spec/impl files. (`confect codegen` will also delete any of these it finds, plus the stale `_generated/registeredFunctions.ts` and `_generated/nodeRegisteredFunctions.ts`, so this step can be skipped.)
3. Run `confect codegen`. Every module under `convex/` will be re-emitted.
