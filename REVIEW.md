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

### Verification bar

Before posting a laziness finding, cite the specific `file:line` where a thunk
is evaluated eagerly or `.error` is read as a presence test. Do not infer a
violation from naming alone.
