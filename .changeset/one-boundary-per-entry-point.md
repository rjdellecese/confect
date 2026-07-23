---
"@confect/server": minor
"@confect/cli": minor
---

Consolidate Effect execution to one boundary per Convex host entry point.

Previously, evaluating a generated function-group module or schema module ran several nested synchronous Effect boundaries (one per compiled args/returns validator and one per table definition) inside the flow of an outer one. Each entry point now performs exactly one audited synchronous run: function registration runs the group-layer build and every function's validator compilation under a single run inside `RegisteredFunctions.buildForGroup`; the generated `convexSchema.ts` compiles all table validators under a single run via the new `ConvexSchema.make` (imported from the dedicated `@confect/server/ConvexSchema` subpath); and HTTP actions build their per-request services as a plain synchronous `Context` — no per-request Effect run at all.

Breaking for direct importers of `SchemaToValidator`: `compileArgsSchema`, `compileReturnsSchema`, `compileTableSchema`, and `compileSchema` now return `Effect`s with typed errors (`CompileAstError` / `CompileError`) instead of returning values and throwing. Run them with your own runtime, or rely on the entry-point boundaries as before — failures still surface as the same thrown tagged errors at module load. `RegisteredConvexFunction.make` / `RegisteredNodeFunction.make` are now Effect-returning; they are only ever consumed by `buildForGroup`, whose signature is unchanged, so generated code is source-compatible. `table.tableDefinition` remains a lazy memoised property.

Run `confect codegen` to regenerate `confect/_generated/convexSchema.ts`. Convex's own `_generated` output is unchanged.
