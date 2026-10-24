# Review instructions

## Always check: schema laziness must be preserved

`@confect/core` exposes function and table schemas lazily so that importing the
codegen-assembled `_generated/spec.ts`—which transitively references every
function in the project—builds **no** schemas at module load. Breaking this
silently inflates every function's cold-start cost with the size of the whole
project; no type error or lint catches it.

Flag as 🔴 Important any change under `packages/core/src/` or
`packages/server/src/` that breaks either rule:

1. **No eager construction.** `FunctionSpec.*` takes `args`/`returns`/`error` as `() => Schema` thunks, and `Table.make` takes `() => Fields`;
   both expose the result as lazy memoised getters. Constructing a
   `FunctionSpec` or `Table`, or assembling a `Spec`, must never evaluate a
   schema thunk. Flag code that passes an already-built schema where a thunk is
   expected, or that reads `.args`/`.returns`/`.error`/`Doc`/`tableDefinition` at construction- or assembly-time.

2. **Presence without forcing.** Code that only needs to know _whether_ an
   optional `error` schema exists must use a key-presence check
   (`"error" in functionProvenance`), never read `.error`—reading it
   force-builds the schema. Flag any switch from `"error" in fp` back to
   `fp.error !== undefined`, or any read of `.error` used purely as an
   existence test. See `Ref.hasErrorSchema`/`Ref.decodeError`.

## Always check: per-function bundle isolation must be preserved

The v9 codegen split impl and schema across the filesystem so that a single
Convex function's cold-start bundle scales with its own group, not the whole
project. This is invisible to types, lint, and most tests—a stray import in a
codegen template silently regresses every function's bundle. Flag as 🔴
Important any change (chiefly in `packages/cli/src/templates.ts`, the generated
`_generated/` layout, or `packages/server/src/`) that breaks either rule:

1. **One group per bundle.** A generated `convex/{path}.ts` must import only its
   own `_generated/registeredFunctions/{path}` module, and each
   `_generated/registeredFunctions/{path}.ts` must import only its own sibling
   `{path}.impl`. Flag any reintroduction of an aggregate registry (e.g.
   `_generated/registeredFunctions.ts`) or any cross-group import that pulls one
   group's `.impl` into another group's bundle.

2. **Application deployment-schema construction stays out of function bundles.**
   `_generated/schema.ts` (the runtime `DatabaseSchema`) must only assemble
   table records without forcing their schemas. `_generated/convexSchema.ts`
   (the deploy `SchemaDefinition`) calls `convex/server`'s `defineSchema` and
   may import `@confect/server`'s `Table.tableDefinition` to construct Convex
   validators and indexes. That conversion belongs at deployment time, not
   at function-module initialization. Keep the two artifacts separate; flag a
   function runtime path that reaches the application's deployment schema or
   constructs its deployment validators, including through an aliased helper.

   Check application import reachability and schema evaluation, not a blanket
   ban on package names or `defineSchema` text. Convex's own internal
   `_systemSchema` initializer can remain in a plain `convex/server` query
   bundle without Confect imports. Establish such upstream provenance with a
   dependency-only control at the same pinned version; it does not excuse
   application-schema construction or eager application-schema reads. Likewise,
   the server `Table` module can remain for its system-table definitions while
   its deployment helper is removed by tree-shaking. Module presence alone
   does not prove deployment-time construction leaked into a function bundle.

## Always check: spec/group/table builders stay pure

`Spec`, `GroupSpec`, and `Table` builder methods (`add`/`addAt`/`addGroupAt`/`addFunction`/`withName`/`make`, etc.) must be immutable:
return a fresh value, never mutate their argument or `this`, and perform no side
effects at module load. A v9 regression hinged on `GroupSpec.withName` secretly
mutating its input in place—load-bearing for one code path and broken for
another. Flag as 🔴 Important any builder that mutates an input or `this` in
place, relies on such mutation for object identity, or runs side effects when a
`*.spec.ts`/`confect/tables/*.ts` module is merely imported.

## Verification bar

Before posting any "always check" finding above, cite the specific `file:line`
where the violation occurs—the eager thunk evaluation, the cross-group import,
the application deployment-schema dependency or validator construction, or the
in-place mutation. Use the import graph and runtime schema-read evidence to
distinguish application code from upstream initialization. Do not infer a
violation from naming alone.
