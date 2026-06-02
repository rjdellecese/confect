# Review instructions

Repo-specific rules for Claude Code Review, applied on top of the default
correctness review. Defer style, formatting, lint, and type errors to CI — they
are already enforced there. Focus findings on real bugs and on the invariants
below.

## Always check: schema laziness must be preserved

`@confect/core` exposes function and table schemas lazily so that importing the
codegen-assembled `_generated/spec.ts` — which transitively references every
function in the project — builds **no** schemas at module load. Breaking this
silently inflates every function's cold-start cost with the size of the whole
project; no type error or lint catches it.

Flag as 🔴 Important any change under `packages/core/src/` or
`packages/server/src/` that breaks either rule:

1. **No eager construction.** `FunctionSpec.*` takes `args` / `returns` /
   `error` as `() => Schema` thunks, and `Table.make` takes `() => Fields`;
   both expose the result as lazy memoised getters. Constructing a
   `FunctionSpec` or `Table`, or assembling a `Spec`, must never evaluate a
   schema thunk. Flag code that passes an already-built schema where a thunk is
   expected, or that reads `.args` / `.returns` / `.error` / `Doc` /
   `tableDefinition` at construction- or assembly-time.

2. **Presence without forcing.** Code that only needs to know _whether_ an
   optional `error` schema exists must use a key-presence check
   (`"error" in functionProvenance`), never read `.error` — reading it
   force-builds the schema. Flag any switch from `"error" in fp` back to
   `fp.error !== undefined`, or any read of `.error` used purely as an
   existence test. See `Ref.hasErrorSchema` / `Ref.decodeError`.

Also flag the inverse: a PR that deletes or weakens the guard tests in
`packages/core/test/FunctionSpec.test.ts` (`describe("laziness invariant")`)
without an equivalent replacement.

## Always check: per-function bundle isolation must be preserved

The v9 codegen split impl and schema across the filesystem so that a single
Convex function's cold-start bundle scales with its own group, not the whole
project. This is invisible to types, lint, and most tests — a stray import in a
codegen template silently regresses every function's bundle. Flag as 🔴
Important any change (chiefly in `packages/cli/src/templates.ts`, the generated
`_generated/` layout, or `packages/server/src/`) that breaks either rule:

1. **One group per bundle.** A generated `convex/{path}.ts` must import only its
   own `_generated/registeredFunctions/{path}` module, and each
   `_generated/registeredFunctions/{path}.ts` must import only its own sibling
   `{path}.impl`. Flag any reintroduction of an aggregate registry (e.g.
   `_generated/registeredFunctions.ts`) or any cross-group import that pulls one
   group's `.impl` into another group's bundle.

2. **Deploy schema stays out of the runtime bundle.** `_generated/schema.ts`
   (the runtime `DatabaseSchema`) must import `@confect/server` and never
   `convex/server`; `_generated/convexSchema.ts` (the deploy `SchemaDefinition`)
   must import `convex/server`'s `defineSchema` and never `@confect/server`.
   Flag any runtime code path or template that makes a function bundle reach
   `convex/server`'s `defineSchema`, or that merges the two schema artifacts
   back into a single module.

Guard: `packages/server/test/importIsolation.test.ts`. Flag PRs that delete or
weaken it without an equivalent replacement.

## Always check: spec / group / table builders stay pure

`Spec`, `GroupSpec`, and `Table` builder methods (`add` / `addAt` /
`addGroupAt` / `addFunction` / `withName` / `make`, etc.) must be immutable:
return a fresh value, never mutate their argument or `this`, and perform no side
effects at module load. A v9 regression hinged on `GroupSpec.withName` secretly
mutating its input in place — load-bearing for one code path and broken for
another. Flag as 🔴 Important any builder that mutates an input or `this` in
place, relies on such mutation for object identity, or runs side effects when a
`*.spec.ts` / `confect/tables/*.ts` module is merely imported.

## Verification bar

Before posting any "always check" finding above, cite the specific `file:line`
where the violation occurs — the eager thunk evaluation, the cross-group or
`convex/server` import, the in-place mutation. Do not infer a violation from
naming alone.
