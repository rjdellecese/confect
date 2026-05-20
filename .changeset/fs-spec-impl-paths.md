---
"@confect/core": major
"@confect/server": major
"@confect/cli": major
"@confect/react": major
"@confect/js": major
"@confect/test": major
---

Replace hand-written root `spec.ts` / `impl.ts` with colocated leaf `*.spec.ts` / `*.impl.ts` pairs, codegen-owned `_generated/spec.ts`, and per-group `_generated/registeredFunctions/{path}` registries for cold-start isolation.

### Breaking changes

- `GroupSpec.make()` and `GroupSpec.makeNode()` no longer take a name; use `GroupSpec.makeAt(name)` / `GroupSpec.makeNodeAt(name)` only in codegen or tests.
- `FunctionImpl.make(api, groupSpec, fn, handler)` and `GroupImpl.make(api, groupSpec)` take the imported sibling spec object instead of a dot-path string.
- Leaf `*.spec.ts` / `*.impl.ts` must **default-export** their `GroupSpec` / `GroupImpl` (named co-exports on specs, e.g. error classes, remain allowed).
- Hand-written root `confect/spec.ts`, `confect/impl.ts`, and parent compose files are removed; run `confect codegen` to generate `_generated/spec.ts` and per-group registries.

### Migration

1. Split specs into leaf `confect/{path}.spec.ts` files using `export default GroupSpec.make()` (or `GroupSpec.makeNode()` for node actions).
2. Pair each spec with `confect/{path}.impl.ts` that default-imports the sibling spec by group name (`import notes from "./notes.spec"`) and default-exports `GroupImpl.make(api, notes)`.
3. Delete root `spec.ts`, `impl.ts`, and parent aggregator specs/impls.
4. Run `confect codegen`.
