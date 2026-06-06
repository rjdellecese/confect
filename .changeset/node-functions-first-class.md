---
"@confect/core": major
"@confect/server": major
"@confect/cli": major
---

Make Node-runtime functions first-class and remove the separate `node` namespace.

A function group's runtime is now declared solely by its spec — `GroupSpec.makeNode()` for a Node action group, `GroupSpec.make()` for a Convex group — exactly like vanilla Convex's per-file `"use node"` directive. The `confect/node/` directory is no longer special: Node specs/impls are ordinary colocated `.spec.ts`/`.impl.ts` pairs that can live anywhere in `confect/`, and codegen emits the `"use node"` directive into the generated `convex/` module based on the spec. This is safe because v9's per-group registries already isolate each Convex function's bundle from every other group's impl, so Node-only code can no longer leak into a Convex-runtime bundle regardless of namespace.

### Why

The `node` namespace existed only because the pre-v9 architecture aggregated every function's impl into one module that all generated `convex/` modules imported; Node functions had to be quarantined into a separate spec/impl/registry tree so Convex-runtime functions wouldn't transitively import Node-only code. v9's per-group isolation removed that constraint, so the namespace was no longer load-bearing — only ergonomic overhead that diverged from vanilla Convex (which identifies Node modules per-file, with no directory requirement).

### Breaking changes

- **API namespace removed.** A Node group at `confect/email.spec.ts` is now referenced as `refs.public.email.send` instead of `refs.public.node.email.send`. Node groups are ordinary groups in the refs tree, nesting preserved like any other group.
- **Generated layout changed.** Node modules are emitted at `convex/<path>.ts` (carrying `"use node"`) instead of `convex/node/<path>.ts`, and their registries at `confect/_generated/registeredFunctions/<path>.ts`. The single assembled `confect/_generated/spec.ts` now contains every group regardless of runtime; `confect/_generated/nodeSpec.ts` is no longer generated (codegen deletes any stale copy on upgrade).
- **`@confect/core` API.** Removed `Spec.makeNode`, `Spec.merge`, and `Spec.isConvexSpec`/`Spec.isNodeSpec`. `Spec` is now a single mixed-runtime container (`Spec.make()` accepts groups of any runtime). `Refs.make(spec)` takes a single argument (the unified spec) instead of `(convexSpec, nodeSpec)`. `GroupSpec.makeNode()`/`makeNodeAt()` and `FunctionSpec.publicNodeAction()`/`internalNodeAction()` are unchanged; `GroupSpec` subgroups may now be of any runtime (a group is just a namespace for its children).

### Migration

1. Move any `confect/node/<path>.spec.ts`/`.impl.ts` files to wherever you want them under `confect/` (e.g. `confect/<path>.spec.ts`); the `node/` directory has no special meaning anymore. Their specs already use `GroupSpec.makeNode()`, so no spec-body change is needed — only fix the impl's relative import of `_generated/schema` if its depth changed.
2. Update call sites to drop the `node` segment: `refs.public.node.<group>.<fn>` → `refs.public.<group>.<fn>`.
3. Replace `Refs.make(spec, nodeSpec)` with `Refs.make(spec)` (codegen does this for `_generated/refs.ts` automatically).
4. Run `confect codegen`. The `convex/` tree and `confect/_generated/` are re-emitted; the stale `_generated/nodeSpec.ts` is removed.
