---
"@confect/core": major
"@confect/server": major
"@confect/cli": major
---

Derive Confect function paths from the filesystem layout of `confect/`. Each group lives in a colocated `*.spec.ts`/`*.impl.ts` pair, and the group's name is its path within `confect/` (file stem for top-level groups, dot-joined directory path for nested groups). See [`/concepts/project-structure`](/concepts/project-structure), [`/concepts/file-naming-conventions`](/concepts/file-naming-conventions), and [`/concepts/spec-impl-model`](/concepts/spec-impl-model) for the current model.

Each `*.spec.ts` default-exports its `GroupSpec`. Each `*.impl.ts` default-imports its sibling spec and default-exports its `GroupImpl`. Named co-exports on `*.spec.ts` (such as error classes) remain allowed.

### Breaking changes

- `GroupSpec.make()` and `GroupSpec.makeNode()` no longer take a name argument; the group name is derived from the spec file's path within `confect/`.
- `FunctionImpl.make(api, groupSpec, fn, handler)` and `GroupImpl.make(api, groupSpec)` now take the imported sibling spec object as their second argument instead of a dot-path string.
- Root `confect/spec.ts`, `confect/impl.ts`, `confect/nodeSpec.ts`, `confect/nodeImpl.ts`, and any parent aggregator `*.spec.ts`/`*.impl.ts` files are no longer used. `confect codegen` deletes any of these on upgrade, along with the stale `_generated/registeredFunctions.ts` and `_generated/nodeRegisteredFunctions.ts`.
- Every module under `convex/` is re-emitted to import from `_generated/registeredFunctions/{path}` instead of the previous aggregate file. Users who commit `convex/` to source control should expect a full rewrite of that directory on first codegen.

### Migration

1. For each existing group, create a colocated `confect/{path}.spec.ts` and `confect/{path}.impl.ts` pair (under a subdirectory for nested groups).
   - In each spec, call `GroupSpec.make()` (or `GroupSpec.makeNode()`) without a name and `export default` the result.
   - In each impl, default-import the sibling spec (e.g. `import notes from "./notes.spec"`), pass it to `FunctionImpl.make`/`GroupImpl.make` in place of the previous dot-path string, and `export default` the resulting `GroupImpl`.
2. Delete root `confect/spec.ts`, `confect/impl.ts`, `confect/nodeSpec.ts`, `confect/nodeImpl.ts`, and any parent aggregator spec/impl files. (`confect codegen` will also delete any of these it finds, plus the stale `_generated/registeredFunctions.ts` and `_generated/nodeRegisteredFunctions.ts`, so this step can be skipped.)
3. Run `confect codegen`. Every module under `convex/` will be re-emitted.
