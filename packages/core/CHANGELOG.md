# @confect/core

## 9.0.0-next.6

### Major Changes

- 762f7eb: Split the deploy-time Convex schema from the runtime `DatabaseSchema`, make `confect/tables/` the single source of truth — including the table name, which is now derived from the filename — and make per-table schema construction lazy.

  Previously, `confect/schema.ts` was user-authored and `DatabaseSchema` carried a `convexSchemaDefinition` field that was eagerly rebuilt on every `.addTable(...)`. That field was an `O(n²)` allocation for `n` tables, and it forced both the deploy CLI (which only needs `defineSchema(...)`) and the runtime (which only needs the table codec lookup) through the same module — so any runtime function bundle dragged in `convex/server`'s `defineSchema`. Issue 1.

  Codegen now scans `confect/tables/*.ts` (every file must default-export a `Table`) and emits two siblings:
  - `confect/_generated/schema.ts` — the runtime `DatabaseSchema`, consumed by `_generated/api.ts`. Imports `@confect/server` but never `convex/server`.
  - `confect/_generated/convexSchema.ts` — the Convex deploy `SchemaDefinition`, re-exported one-line from `convex/schema.ts`. Imports `convex/server` but never `@confect/server`.

  The `convexSchemaDefinition` field is removed from `DatabaseSchema` and `Api`. `TestConfect.layer` now takes the Convex schema definition as a separate argument so it can stay aligned with the deploy artifact without bringing the runtime schema along for the ride.

  ### Filename-derived table names

  The table name is now derived from the file's basename — `confect/tables/notes.ts` defines a table called `notes`. `Table.make` no longer accepts a name argument and returns an _unnamed_ `Table` value; codegen invokes that value with the filename to produce the bound table.

  This eliminates a class of subtle infelicities: the file basename and the table name can never drift out of sync, cross-table `_id` references are type-constrained against the actual set of declared tables (catching typos at compile time), and ESM cycle hazards for mutual cross-table `Id` references are gone because authoring files no longer transitively import each other.

  Codegen now emits two new sets of files alongside `_generated/schema.ts` and `_generated/convexSchema.ts`:
  - `confect/_generated/id.ts` — a single `Id` constructor whose argument is type-constrained to the union of your table names. Use `Id("notes")` everywhere you previously wrote `GenericId.GenericId("notes")`.
  - `confect/_generated/tables/<name>.ts` — one thin wrapper per table that binds the unnamed value from `confect/tables/<name>.ts` to its filename. This is what other modules (specs, impls, HTTP handlers) default-import to reach a table's `Doc`, `Fields`, and `tableName`.

  Table filenames must be valid JS identifiers, may not start with `_` (Convex reserves underscore-prefixed names for system tables), and may not collide with reserved JS keywords like `import.ts`. Pick a casing convention you like — Confect's example code uses `snake_case` (`notes.ts`, `user_profiles.ts`).

  The bound `Table`'s `name` property has been renamed to `tableName`. This avoids a silent collision with the built-in `Function.prototype.name` that JavaScript carries on every function value (including the new unnamed-callable `UnnamedTable`).

  ### Lazy per-table schema construction

  `Table.make` takes a `() => Schema.Struct({...})` callback rather than a bare struct, and a bound `Table`'s `Fields`, `Doc`, and `tableDefinition` are lazy memoised getters that only invoke that callback on first access.

  Previously, every `confect/tables/<name>.ts` module ran `Schema.Struct({...})` (and the corresponding `compileTableSchema` / `defineTable` work) at module-load time. Because the codegen-emitted `_generated/schema.ts` is imported transitively from every per-group function bundle, loading any one function eagerly built _every_ table's schema graph — paying a cold-start cost proportional to the whole project, not just the function being invoked.

  The bound `Table` now exposes `Fields` / `Doc` / `tableDefinition` as lazy getters that compute their value on first access, then replace themselves with a plain non-writable data property so second-and-subsequent accesses are observably indistinguishable from a plain property (and skip all function-call overhead). The result: a function bundle only pays the schema-construction cost for tables it actually touches via `db.table(name)` (which reaches `Fields` through `Document.decode`). The `UnnamedTable` callable no longer exposes `Fields` or `tableDefinition` — read these off the bound `Table` (the generated `_generated/tables/<name>.ts` wrapper already binds the name).

  ### Migration
  1. Delete your `confect/schema.ts`. Codegen will refuse to run while a stray copy is present.
  2. Rename each `confect/tables/<Name>.ts` to a valid JS identifier in your chosen casing convention (e.g. `confect/tables/notes.ts`). The basename becomes the table name; you no longer pass it as an argument.
  3. Convert each table file to a **default-export-only** unnamed module: drop the name argument from `Table.make`, wrap the field-schema struct in a `() => ...` callback, and switch any `GenericId.GenericId("users")` references to `Id("users")` imported from `../_generated/id`:

     ```diff
     - import { GenericId } from "@confect/core";
       import { Table } from "@confect/server";
       import { Schema } from "effect";
     + import { Id } from "../_generated/id";

     - export default Table.make(
     -   "notes",
     -   Schema.Struct({
     -     userId: Schema.optional(GenericId.GenericId("users")),
     -     text: Schema.String,
     -   }),
     - );
     + export default Table.make(() =>
     +   Schema.Struct({
     +     userId: Schema.optional(Id("users")),
     +     text: Schema.String,
     +   }),
     + );
     ```

  4. Rewire every consumer site (specs, impls, integration tests, HTTP handlers, etc.) to import from the generated wrapper rather than directly from `tables/`. The wrapper is also where you now read `Doc` / `Fields` / `tableDefinition` (the unnamed `Table.make(...)` callable no longer exposes them):

     ```diff
     - import Notes from "../tables/Notes";
     + import notes from "../_generated/tables/notes";

     - returns: Schema.Array(Notes.Doc),
     + returns: Schema.Array(notes.Doc),
     ```

  5. Replace every remaining `GenericId.GenericId("x")` call site with `Id("x")` from `_generated/id` (in spec `args`/`returns`, in `TaggedError` schemas, in `TestConfect.run`, etc.).
  6. If you read `table.name` anywhere off a bound `Table`, rename it to `table.tableName`.
  7. Re-run `confect codegen`. It will create `confect/_generated/schema.ts`, `confect/_generated/convexSchema.ts`, `confect/_generated/id.ts`, and one `confect/_generated/tables/<name>.ts` wrapper per table; and it will rewrite `convex/schema.ts` to a one-line re-export.
  8. If you use `@confect/test`, pass the generated Convex schema definition to `TestConfect.layer`:

     ```diff
     - import confectSchema from "./confect/schema";
     + import confectSchema from "./confect/_generated/schema";
     + import convexSchema from "./confect/_generated/convexSchema";

       export const layer = TestConfect_.layer(
         confectSchema,
     +   convexSchema,
         import.meta.glob("./convex/**/!(*.*.*)*.*s"),
       );
     ```

  ### New warning: no tables discovered

  If a Confect project has no tables — either `confect/tables/` is missing entirely or it exists but contains no `.ts` files — codegen now emits a yellow `⚠` warning and continues, producing an empty `DatabaseSchema.make()` / `defineSchema({})`. Table-free backends (e.g. action-only proxies, webhook bridges) are still legal; the warning just catches the much more common case of a typoed directory name or files placed at the wrong path. To silence it, add at least one `Table.make(...)` module under `confect/tables/`.

  ### New error: invalid table filename

  Codegen now rejects table files whose basename is not a valid JS identifier (e.g. `user-profiles.ts`), starts with `_` (reserved for Convex system tables), or shadows a reserved JS keyword (e.g. `import.ts`). Rename the offending file to fix it — for example, `user-profiles.ts` → `user_profiles.ts` or `userProfiles.ts`.

## 9.0.0-next.5

## 9.0.0-next.4

## 9.0.0-next.3

### Patch Changes

- 6d85210: Resolve `FunctionImpl` / `GroupImpl` group paths via an immutable `paths` map on `Spec` instead of identity-walking the assembled tree.

  ### Why

  Since `9.0.0-next.1`, codegen has wrapped every parent leaf that has sibling subdirectory specs in `<parent>.addGroupAt("child", <child>)`. Because `GroupSpec.addGroupAt` is immutable, that produced a fresh object in the assembled tree, while the parent's `*.impl.ts` continued to hold a reference to the original imported leaf. The runtime resolver compared by `===`, so every such impl failed `validateImpl` with "Could not resolve group path for the provided GroupSpec." Child impls happened to work only because `GroupSpec.withName` was secretly mutating its argument in place to keep the child's identity stable — an asymmetry that was load-bearing for one half of the API and broken for the other.

  ### What changed
  - `@confect/core/Spec` carries a new `readonly paths: ReadonlyMap<GroupSpec.AnyWithProps, string>` field and exposes a chainable `Spec#addPath(group, path)` builder. `add` / `addAt` / `merge` propagate `paths` unchanged; `merge` re-prefixes a node spec's entries with `"node."` to match the merged tree.
  - `@confect/core/GroupSpec.withName` is now pure: it returns a fresh copy when the name differs and no longer rewrites the input in place. No new identity-tracking machinery is introduced.
  - `@confect/server/FunctionImpl.make` and `GroupImpl.make` resolve their group path via `api.spec.paths.get(group)` — an O(1) map lookup instead of a tree walk — and throw a clearer error pointing at `Spec.addPath` when the spec hasn't been registered.
  - `@confect/server/GroupPath` (the old identity-based resolver) is deleted.
  - `@confect/cli` codegen emits one `.addPath(<binding>, "<dot.path>")` call per leaf in `_generated/spec.ts` (and `_generated/nodeSpec.ts`) so the imported leaves carry their full paths into the assembled spec value.

  ### User-facing impact
  - Spec authoring (`*.spec.ts`) and impl authoring (`*.impl.ts`) APIs are unchanged. `FunctionImpl.make(api, spec, name, handler)` and `GroupImpl.make(api, spec)` keep their exact signatures.
  - Generated `_generated/spec.ts` (and `_generated/nodeSpec.ts`) pick up one `.addPath(...)` chain entry per leaf on the next `confect codegen` run. The shape is fully immutable — no module-load mutation, no hidden side effects.
  - Hand-rolled tests that construct a `Spec` and pass it to `Api.make` must now also call `.addPath(spec, "dot.path")` for any group they intend to look up.

  ### Fixes

  This eliminates the runtime regression introduced in `9.0.0-next.1` for any project layout where a `confect/{path}.spec.ts` declares functions alongside a sibling `confect/{path}/` subdirectory of further specs.

## 9.0.0-next.2

## 9.0.0-next.1

## 9.0.0-next.0

### Major Changes

- 6db3a3a: Derive Confect function paths from the filesystem layout of `confect/`. Each group lives in a colocated `*.spec.ts`/`*.impl.ts` pair, and the group's name is its path within `confect/` (file stem for top-level groups, dot-joined directory path for nested groups). See [Project Structure](https://confect.dev/concepts/project-structure), [File Naming Conventions](https://confect.dev/concepts/file-naming-conventions), and [The Spec/Impl Model](https://confect.dev/concepts/spec-impl-model) for the current model.

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

## 8.0.0

### Minor Changes

- 4bb2722: Bump Effect ecosystem to latest. `@effect/platform` is now `^0.96.1` and `@effect/platform-node` is now `^0.106.0` in `@confect/server`'s peer dependencies; `effect` peer is now `^3.21.2` across packages. Consumers must upgrade `@effect/platform`, `@effect/platform-node`, and `effect` in lockstep when bumping `@confect/server`.

### Patch Changes

- 40c1cff: Switch sibling `@confect/*` peer-dependency specifiers from `workspace:*` to `workspace:^`. Published peer ranges are now caret-based (e.g. `^7.0.0`) instead of exact-pinned, so non-major upgrades of one `@confect/*` package no longer fall out of range for its peer dependents.

  Paired with the Changesets `onlyUpdatePeerDependentsWhenOutOfRange` flag, this prevents the entire `@confect/*` family from being promoted to a major bump on every release when only minor/patch changes are present.

  `@confect/cli` additionally moves `@effect/platform` from `peerDependencies` to `dependencies`, since the CLI consumes it as an internal implementation detail (for `FileSystem`/`Path`) rather than exposing it in its public API. Consumers no longer need to install `@effect/platform` themselves to use the CLI.

## 7.0.0

### Minor Changes

- 90094d0: Add typed errors to Confect functions (queries, mutations, and actions). Declare an optional `error` schema in `FunctionSpec` and recover it as a typed value at every call site—`useQuery`, `useMutation`, `useAction`, `HttpClient`, `WebSocketClient`, and `TestConfect`—without paying for it on functions that don't fail.

  Typed errors travel across the function boundary as Convex's native [`ConvexError`](https://docs.convex.dev/functions/error-handling/application-errors#throwing-application-errors): the encoded error sits in `ConvexError.data`, leaving the `returns` channel unsullied and preserving native Convex semantics for non-Confect callers of the same API.

  ### Authoring a function with typed errors

  `FunctionSpec` constructors now accept an optional `error` schema. To support multiple error shapes, combine them with `Schema.Union`.

  ```ts
  import { FunctionSpec, GenericId, GroupSpec } from "@confect/core";
  import { Schema } from "effect";

  export class NoteNotFound extends Schema.TaggedError<NoteNotFound>()(
    "NoteNotFound",
    { noteId: GenericId.GenericId("notes") },
  ) {}

  export const notes = GroupSpec.make("notes").addFunction(
    FunctionSpec.publicQuery({
      name: "getOrFail",
      args: Schema.Struct({ noteId: GenericId.GenericId("notes") }),
      returns: Notes.Doc,
      error: NoteNotFound,
    }),
  );
  ```

  The `FunctionImpl` for that ref can now `Effect.fail` (or `mapError` to) any value matching the declared schema. Whichever invocation path the caller takes—`useQuery`/`useMutation`/`useAction`, `HttpClient`, `WebSocketClient`, or `TestConfect`—Confect encodes the failure, transports it via `ConvexError`, and surfaces the decoded value in the appropriate channel for that call site.

  ```ts
  import { FunctionImpl } from "@confect/server";
  import { Effect } from "effect";
  import api from "../_generated/api";
  import { DatabaseReader } from "../_generated/services";
  import { NoteNotFound } from "./notes.spec";

  const getOrFail = FunctionImpl.make(api, "notes", "getOrFail", ({ noteId }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;
      return yield* reader
        .table("notes")
        .get(noteId)
        .pipe(Effect.mapError(() => new NoteNotFound({ noteId })));
    }),
  );
  ```

  ### Consuming a typed error

  `@confect/js` (`HttpClient`, `WebSocketClient`) and `@confect/test` (`TestConfect`) surface the decoded error in the `Effect` error channel alongside the existing `HttpClientError`/`WebSocketClientError`/`ParseError`:

  ```ts
  HttpClient.query(refs.public.notes.getOrFail, { noteId });
  // Effect.Effect<Note, NoteNotFound | HttpClientError | ParseError>
  ```

  ### `@confect/react`—breaking changes

  `useQuery`, `useMutation`, and `useAction` now expose typed errors, and `useQuery` returns a tagged result type instead of `Returns | undefined`.

  **`useQuery` now returns `QueryResult<A, E>`.** Loading and (when an `error` schema is declared) failure are reified as variants alongside success. Match on the result with `QueryResult.match`:

  Before:

  ```tsx
  const notes = useQuery(refs.public.notes.list, {});
  if (notes === undefined) return <p>Loading…</p>;
  return <NoteList notes={notes} />;
  ```

  After:

  ```tsx
  import { QueryResult, useQuery } from "@confect/react";

  const notes = useQuery(refs.public.notes.list, {});
  return QueryResult.match(notes, {
    onLoading: (skipped) => (skipped ? null : <p>Loading…</p>),
    onSuccess: (notes) => <NoteList notes={notes} />,
  });
  ```

  The `Loading` variant carries a `skipped: boolean` flag, exposed as the argument to `onLoading`. It distinguishes a query that is genuinely in flight (`skipped: false`) from one that is sitting idle because `"skip"` was passed as its args (`skipped: true`)—a distinction `convex/react`'s plain `undefined` return value cannot make. Use it to render a loading indicator only when work is actually happening, and an empty/placeholder state otherwise.

  When the ref declares an `error` schema, `onFailure` becomes required and receives the decoded typed error:

  ```tsx
  const lookup = useQuery(refs.public.notes.getOrFail, { noteId });
  QueryResult.match(lookup, {
    onLoading: (skipped) => (skipped ? null : "Looking up…"),
    onSuccess: (note) => `Found: ${note.text}`,
    onFailure: (error) => `Note ${error.noteId} not found.`,
  });
  ```

  `QueryResult` is a Confect-native type exported from `@confect/react`.

  **`useMutation` and `useAction` return `Promise<Either<A, E>>` when the ref declares an `error` schema.** Refs without an `error` schema continue to resolve to `Promise<A>`, matching the prior shape and `convex/react`'s behavior.

  ```ts
  const deleteOrFail = useMutation(refs.public.notes.deleteOrFail);
  const result = await deleteOrFail({ noteId });
  // Either.Either<null, NoteNotFound | Forbidden>
  Either.match(result, {
    onLeft: (error) => /* typed error */,
    onRight: (value) => /* success */,
  });

  const deleteNote = useMutation(refs.public.notes.delete_); // no `error` schema
  await deleteNote({ noteId }); // Promise<null>, as before
  ```

  Unspecified failures continue to reject the promise.

  ### Migration
  - For each `useQuery` call site, replace `result === undefined` checks and direct property access with `QueryResult.match` (or the lower-level `QueryResult.isLoading`/`isSuccess`/`isFailure` predicates).
  - For each `useMutation`/`useAction` call site whose ref now declares an `error` schema, unwrap the resolved `Either` (e.g. with `Either.match`); call sites against refs without an `error` schema need no change.

## 6.0.0

### Minor Changes

- df95ce7: Add `Ref.OptionalArgs` type utility to `@confect/core` for conditionally optional function args. `QueryRunner`, `MutationRunner`, and `ActionRunner` now accept optional args for no-arg Confect functions. `useQuery`, `useMutation`, and `useAction` now accept optional args for no-arg Confect functions. `TestConfect` `query`/`mutation`/`action` helpers now accept optional args for no-arg Confect functions.

### Patch Changes

- a8083e8: Fix table field path inference when a schema has a `name` field and an optional Convex ID or bytes field.

## 5.0.0

## 4.0.0

## 3.0.0

### Minor Changes

- 5fb6a61: Add support for plain Convex functions. Plain Convex queries, mutations, and actions can now be included in your Confect spec and impl tree using new `FunctionSpec.convexPublic*` and `FunctionSpec.convexInternal*` constructors. This enables interop with Convex components and libraries (such as Workpool, Workflow, Migrations, and Better Auth) that require user-defined or -provided Convex functions.

## 2.0.0

## 1.0.3

## 1.0.2

## 1.0.1

### Patch Changes

- 00b12a0: Fix `RegisteredFunction` type, which was previously inferring query functions as `never`

## 1.0.0

### Major Changes

- 2ff70a7: Initial release.

## 1.0.0-next.4

### Patch Changes

- 46109fb: Support Node actions

## 1.0.0-next.3

### Patch Changes

- 9cd3cda: `confect/_generated/refs.ts` now default exports the `Refs` object, which now contains `public` and `internal` fields for each corresponding collection of Confect functions
- 186c130: `FunctionSpec.query` becomes `FunctionSpec.publicQuery`, same for mutations and actions

## 1.0.0-next.2

### Patch Changes

- 071b6ed: Upgrade deps

## 1.0.0-next.1

### Patch Changes

- 5a4127f: Fix `Refs` type (#304)

## 1.0.0-next.0

### Major Changes

- 2ff70a7: Initial release.
