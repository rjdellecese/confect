# @confect/js

## 9.2.3

### Patch Changes

- @confect/core@9.2.3

## 9.2.2

### Patch Changes

- @confect/core@9.2.2

## 9.2.1

### Patch Changes

- @confect/core@9.2.1

## 9.2.0

### Patch Changes

- @confect/core@9.2.0

## 9.1.5

### Patch Changes

- @confect/core@9.1.5

## 9.1.4

### Patch Changes

- @confect/core@9.1.4

## 9.1.3

### Patch Changes

- Updated dependencies [8d63382]
  - @confect/core@9.1.3

## 9.1.2

### Patch Changes

- @confect/core@9.1.2

## 9.1.1

### Patch Changes

- @confect/core@9.1.1

## 9.1.0

### Patch Changes

- Updated dependencies [4d8a568]
  - @confect/core@9.1.0

## 9.0.2

### Patch Changes

- @confect/core@9.0.2

## 9.0.1

### Patch Changes

- 445ea9b: Loosen and align dependency ranges across all packages:
  - The `convex` peer dependency is now `^1.32.0` in every package (previously pinned exactly to `1.39.1`, or `^1.30.0` in `@confect/react`). The range is validated against convex 1.32.0 through 1.40.0.
  - `@confect/server`'s `@effect/platform-node` peer dependency is now optional — it is only needed when using the `@confect/server/node` entrypoint.
  - `@confect/cli` now uses caret ranges for its `@effect/platform` and `@effect/platform-node` dependencies so they can deduplicate with the versions resolved for `@confect/server`, and no longer declares an unused direct dependency on `@effect/platform-node-shared`.
  - `@confect/test` now accepts any `convex-test` release in `>=0.0.50 <0.1.0` instead of exactly 0.0.50.

- Updated dependencies [445ea9b]
  - @confect/core@9.0.1

## 9.0.0

### Major Changes

- a905072: Rearchitect Confect so that cold-starting a Convex function only evaluates its own group's module graph, cutting cold-start execution time on large projects. The change touches how you author tables, specs, and impls, and removes the project-wide aggregation that used to make every function evaluate every other function's code—and every table's schema—the first time it ran.

  Convex bundles a deployment into a single artifact, but a function's cold start only _evaluates_ the module graph reachable from its own entry point. Previously, all impls were assembled into a single root `confect/impl.ts` that every generated `convex/` module imported, so cold-starting any one query, mutation, or action transitively evaluated the impl of every other function in the project, plus every function spec and every table schema, at module-load time. Cold-start execution time scaled with the size of the whole project. In v9, `confect codegen` emits one registry per group and each generated `convex/` module imports only its own group—so a function's cold-start work scales with its own group, not the project.

  ### Filesystem-driven groups

  Your API is now authored as colocated `*.spec.ts`/`*.impl.ts` pairs, one pair per group, and **the file's path within `confect/` is the group's name** (its stem for top-level groups, the dot-joined directory path for nested groups). `GroupSpec.make()` and `GroupSpec.makeNode()` no longer take a name argument.
  - Each `*.spec.ts` `export default`s its `GroupSpec` (named co-exports like error classes are still allowed).
  - Each `*.impl.ts` default-imports its sibling spec, passes it to `FunctionImpl.make` / `GroupImpl.make`, and ends the layer pipeline with `GroupImpl.finalize`—a compile-time completeness check that only typechecks once every function the spec declares has a `FunctionImpl` provided.
  - The root `confect/spec.ts`, `confect/impl.ts`, `confect/nodeSpec.ts`, and `confect/nodeImpl.ts` files are gone, along with `Impl.make` and `Impl.finalize`. `confect codegen` deletes any of these (and the stale aggregate `_generated/registeredFunctions.ts` / `_generated/nodeRegisteredFunctions.ts`) on upgrade.

  ### Tables are the source of truth, named by their filename

  Your schema now lives entirely in `confect/tables/`, one `Table` per file, and **the filename is the table name**—`confect/tables/notes.ts` defines the `notes` table. `Table.make` no longer takes a name argument. The user-authored `confect/schema.ts` is removed; codegen scans `confect/tables/*.ts` and generates everything else.

  Each table file is a default-export-only module, and its field schema is wrapped in a `() =>` callback so it is built lazily—a function only pays a table's schema-construction cost at cold start for tables it actually reads.

  ```ts confect/tables/notes.ts
  import { Table } from "@confect/server";
  import { Schema } from "effect";
  import { Id } from "../_generated/id";

  export default Table.make(() =>
    Schema.Struct({
      userId: Schema.optional(Id("users")),
      text: Schema.String,
    }),
  );
  ```

  Codegen emits, alongside it:
  - `_generated/schema.ts`—the runtime `DatabaseSchema`. Never imports `convex/server`, so a runtime cold start no longer evaluates `defineSchema(...)`.
  - `_generated/convexSchema.ts`—the Convex deploy `SchemaDefinition`, re-exported from `convex/schema.ts`.
  - `_generated/id.ts`—a type-safe `Id` constructor whose argument is constrained to your table names. Use `Id("notes")` everywhere you previously wrote `GenericId.GenericId("notes")`; cross-table `_id` typos are now caught at compile time.
  - `_generated/tables/<name>.ts`—a thin wrapper that binds the filename to the table. Read a table's `Doc`, `Fields`, and `tableName` from this wrapper (`import notes from "../_generated/tables/notes"`), not from `confect/tables/`.

  A bound table's `name` property is renamed to `tableName` (avoiding a collision with `Function.prototype.name`).

  ### Specs and impls: lazy schemas, and impls take the `DatabaseSchema`

  `FunctionSpec.*` constructors now take `args`, `returns`, and the optional `error` as `() => Schema` thunks, so importing a spec builds no schemas until a function is invoked. `FunctionImpl.make` and `GroupImpl.make` take the runtime `DatabaseSchema` (the default export of `_generated/schema`) as their first argument instead of the whole `Api`—which keeps the project-wide spec graph out of a function's cold-start module graph. The `Api` module (`Api.make`, the `Api` type) and the generated `_generated/api.ts` / `_generated/nodeApi.ts` files are removed.

  **Before:**

  ```ts confect/notes.spec.ts
  export const notes = GroupSpec.make("notes").addFunction(
    FunctionSpec.publicQuery({
      name: "list",
      args: Schema.Struct({}),
      returns: Schema.Array(Notes.Doc),
    }),
  );
  ```

  ```ts confect/notes.impl.ts
  const list = FunctionImpl.make(api, "notes", "list", handler);
  export const notes = GroupImpl.make(api, "notes").pipe(Layer.provide(list));
  ```

  **After:**

  ```ts confect/notes.spec.ts
  import notes from "./_generated/tables/notes";

  export default GroupSpec.make().addFunction(
    FunctionSpec.publicQuery({
      name: "list",
      args: () => Schema.Struct({}),
      returns: () => Schema.Array(notes.Doc),
    }),
  );
  ```

  ```ts confect/notes.impl.ts
  import databaseSchema from "./_generated/schema";
  import notes from "./notes.spec";

  const list = FunctionImpl.make(databaseSchema, notes, "list", handler);
  export default GroupImpl.make(databaseSchema, notes).pipe(
    Layer.provide(list),
    GroupImpl.finalize,
  );
  ```

  ### Node functions are first-class

  A group's runtime is now declared solely by its spec—`GroupSpec.makeNode()` for a Node action group, `GroupSpec.make()` otherwise—mirroring vanilla Convex's per-file `"use node"` directive. The separate `node` namespace is gone: Node specs/impls are ordinary colocated pairs that can live anywhere in `confect/`, and codegen emits the `"use node"` directive based on the spec.
  - A Node group at `confect/email.spec.ts` is now reached at `refs.public.email.send` instead of `refs.public.node.email.send`.
  - `@confect/core` removes `Spec.makeNode`, `Spec.merge`, and `Spec.isConvexSpec` / `Spec.isNodeSpec`; `Spec.make()` is a single mixed-runtime container and `Refs.make(spec)` takes one argument. `GroupSpec.makeNode()`, `FunctionSpec.publicNodeAction()` / `internalNodeAction()` are unchanged.

  ### Less work at cold start

  Confect's own packages now import Effect from its submodule paths (`import * as Schema from "effect/Schema"`) instead of the `"effect"` barrel. A barrel import of a namespace re-export pulls the entire namespace into the module graph a function evaluates at cold start, even when only a small part is used; importing the submodule path evaluates only what's needed. On a minimal function this cut cold-start module-evaluation time by ~35%. This is an internal change with no effect on your code—but to get the full win, import Effect from its submodule paths in your own `confect/` files too, since a single barrel import anywhere in a function's module graph re-pins the whole namespace.

  ### Stable React hook results

  `@confect/react` hooks now hold stable identities across renders, matching Convex's own hooks. `useQuery` memoizes the decoded `QueryResult` by the (referentially stable) Convex result, so unchanged data keeps the same `QueryResult` instead of a fresh one each render—fixing effect/memo loops (including `Maximum update depth exceeded`) for code that derives off the result. `useMutation` and `useAction` return a stable `useCallback`, and `Ref.getFunctionReference` caches the Convex function reference per function name.

  ### Codegen robustness

  The codegen bundler now uses [`bundle-require`](https://github.com/egoist/bundle-require), so impls may import third-party packages and use `tsconfig.json` `paths` aliases (`~/*`, `@/*`, …) for their own source. A parent `confect/{path}.spec.ts` may now declare functions alongside a sibling `confect/{path}/` subdirectory of further specs, and codegen reports a clear error on a name collision between the two.

  ### Migration
  1. **Tables.** Delete `confect/schema.ts`. Rename each table file to a valid JS identifier (e.g. `confect/tables/notes.ts`); the basename becomes the table name. Drop the name argument from `Table.make`, wrap the field struct in `() =>`, and replace `GenericId.GenericId("x")` with `Id("x")` from `_generated/id`. If you read `table.name` off a bound table, rename it to `table.tableName`.
  2. **Specs.** Split each group into a colocated `*.spec.ts` that `export default`s `GroupSpec.make()` (no name). Wrap every `args`/`returns`/`error` in `() =>`. Import a table's `Doc`/`Fields` from its wrapper, `import notes from "./_generated/tables/notes"`.
  3. **Impls.** In each `*.impl.ts`, default-import the sibling spec, import `databaseSchema` from `_generated/schema`, pass it to `FunctionImpl.make` / `GroupImpl.make` in place of `api`, end the pipeline with `GroupImpl.finalize`, and `export default` it. Delete the root `confect/spec.ts`, `impl.ts`, `nodeSpec.ts`, and `nodeImpl.ts` (codegen will also remove them).
  4. **Node groups.** Move any `confect/node/<path>` files anywhere you like under `confect/`; the `node/` directory no longer has special meaning. Drop the `node` segment from call sites (`refs.public.node.<group>` → `refs.public.<group>`) and replace `Refs.make(spec, nodeSpec)` with `Refs.make(spec)`.
  5. **Tests.** If you use `@confect/test`, import `confectSchema` from `_generated/schema`, import the generated `convexSchema` from `_generated/convexSchema`, and pass `convexSchema` as the new second argument to `TestConfect.layer`.
  6. **Optional.** Adopt submodule Effect imports (`import * as Schema from "effect/Schema"`) in your own `confect/` files for the full cold-start savings.
  7. Run `confect codegen`. It re-emits the entire `convex/` tree and `confect/_generated/`, deleting any stale files from earlier versions.

### Patch Changes

- 9eec71c: Generate the published `.d.ts` declarations with the TypeScript compiler instead of tsdown's declaration bundler. tsdown now emits JavaScript only (`dts: false`); each package has a composite `tsconfig.src.json`, and `tsc -b` emits the declarations into `dist/` as part of the build. (`@confect/cli` is the exception: it ships only a binary, so it emits no declarations at all.)

  The emitted types are equivalent to before—same exported surface, same inferred shapes—so no consumer-facing type changes. One incidental improvement comes with the switch: declaration maps (`.d.ts.map`) now ship alongside the types (with `src/` included in the published files, so "go to definition" lands on the original source).

- Updated dependencies [9eec71c]
- Updated dependencies [a905072]
  - @confect/core@9.0.0

## 9.0.0-next.10

### Patch Changes

- 9eec71c: Generate the published `.d.ts` declarations with the TypeScript compiler instead of tsdown's declaration bundler. tsdown now emits JavaScript only (`dts: false`); each package has a composite `tsconfig.src.json`, and `tsc -b` emits the declarations into `dist/` as part of the build. (`@confect/cli` is the exception: it ships only a binary, so it emits no declarations at all.)

  The emitted types are equivalent to before—same exported surface, same inferred shapes—so no consumer-facing type changes. One incidental improvement comes with the switch: declaration maps (`.d.ts.map`) now ship alongside the types (with `src/` included in the published files, so "go to definition" lands on the original source).

- Updated dependencies [9eec71c]
  - @confect/core@9.0.0-next.10

## 9.0.0-next.9

### Patch Changes

- Updated dependencies [4894959]
  - @confect/core@9.0.0-next.9

## 9.0.0-next.8

### Patch Changes

- 3fec285: Import Effect from its submodule paths internally to shrink per-function cold-start bundles.

  Confect's packages now import Effect modules from their submodule paths (`import * as Schema from "effect/Schema"`) instead of the `"effect"` barrel (`import { Schema } from "effect"`).

  ### Why

  A barrel import of a namespace re-export defeats esbuild's tree-shaking: accessing `Schema.X` from `import { Schema } from "effect"` retains the _entire_ `Schema` namespace, because the bundler can't prune property access on the barrel's `export * as Schema`. So every Convex function's cold-start bundle was pulling all of `effect/Schema` and `effect/Stream` — and, transitively through Schema's `Arbitrary`, `fast-check` — whether the function used them or not.

  Importing from the submodule path tree-shakes normally. On a minimal function this cut the bundle esbuild produces by ~54% (the `effect/Schema` module alone by ~75%) and its cold-start module-evaluation time by ~35%, with `fast-check` dropped entirely. This is also the import style Effect v4 recommends, so it's forward-compatible. A `no-restricted-imports` ESLint rule now enforces it across the codebase (type-only imports and `@effect/vitest` are exempt).

  No API changes — your existing code keeps working.

  ### Getting the full win in your own code

  This change shrinks the Confect code in every function bundle, but a function's bundle also includes your own `confect/tables/*` and `*.spec.ts` files. esbuild retains the union across all importers, so a single barrel import anywhere in a function's module graph re-pins the whole `effect/Schema` namespace and undoes the reduction. To get the full bundle/cold-start savings, import Effect from its submodule paths in your own Confect files too:

  ```diff
  - import { Schema } from "effect";
  + import * as Schema from "effect/Schema";
  ```

  Bare helpers (`pipe`, `flow`, `identity`) come from `"effect/Function"`.

- Updated dependencies [3fec285]
  - @confect/core@9.0.0-next.8

## 9.0.0-next.7

### Patch Changes

- Updated dependencies [5d19484]
  - @confect/core@9.0.0-next.7

## 9.0.0-next.6

### Patch Changes

- Updated dependencies [46045a9]
- Updated dependencies [762f7eb]
  - @confect/core@9.0.0-next.6

## 9.0.0-next.5

### Patch Changes

- @confect/core@9.0.0-next.5

## 9.0.0-next.4

### Patch Changes

- @confect/core@9.0.0-next.4

## 9.0.0-next.3

### Patch Changes

- Updated dependencies [6d85210]
  - @confect/core@9.0.0-next.3

## 9.0.0-next.2

### Patch Changes

- @confect/core@9.0.0-next.2

## 9.0.0-next.1

### Patch Changes

- @confect/core@9.0.0-next.1

## 9.0.0-next.0

### Patch Changes

- Updated dependencies [6db3a3a]
  - @confect/core@9.0.0-next.0

## 8.0.0

### Minor Changes

- 4bb2722: Bump Effect ecosystem to latest. `@effect/platform` is now `^0.96.1` and `@effect/platform-node` is now `^0.106.0` in `@confect/server`'s peer dependencies; `effect` peer is now `^3.21.2` across packages. Consumers must upgrade `@effect/platform`, `@effect/platform-node`, and `effect` in lockstep when bumping `@confect/server`.

### Patch Changes

- 40c1cff: Switch sibling `@confect/*` peer-dependency specifiers from `workspace:*` to `workspace:^`. Published peer ranges are now caret-based (e.g. `^7.0.0`) instead of exact-pinned, so non-major upgrades of one `@confect/*` package no longer fall out of range for its peer dependents.

  Paired with the Changesets `onlyUpdatePeerDependentsWhenOutOfRange` flag, this prevents the entire `@confect/*` family from being promoted to a major bump on every release when only minor/patch changes are present.

  `@confect/cli` additionally moves `@effect/platform` from `peerDependencies` to `dependencies`, since the CLI consumes it as an internal implementation detail (for `FileSystem`/`Path`) rather than exposing it in its public API. Consumers no longer need to install `@effect/platform` themselves to use the CLI.

- Updated dependencies [4bb2722]
- Updated dependencies [40c1cff]
  - @confect/core@8.0.0

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

### Patch Changes

- Updated dependencies [90094d0]
  - @confect/core@7.0.0

## 6.0.0

### Patch Changes

- df95ce7: Add `Ref.OptionalArgs` type utility to `@confect/core` for conditionally optional function args. `QueryRunner`, `MutationRunner`, and `ActionRunner` now accept optional args for no-arg Confect functions. `useQuery`, `useMutation`, and `useAction` now accept optional args for no-arg Confect functions. `TestConfect` `query`/`mutation`/`action` helpers now accept optional args for no-arg Confect functions.
- Updated dependencies [df95ce7]
- Updated dependencies [a8083e8]
  - @confect/core@6.0.0

## 5.0.0

### Minor Changes

- fb17b7e: Add `WebSocketClient`, a WebSocket-based client wrapping Convex's `ConvexClient`. Provides the same `query`, `mutation`, and `action` methods as `HttpClient`, plus `reactiveQuery` which returns a `Stream` of live query results.

### Patch Changes

- 2c4b0c9: Fix `HttpClient` to only accept public `Ref`s

  `HttpClient` query, mutation, and action methods now correctly reject internal `Ref`s at the type level, matching the runtime behavior of Convex browser clients which can only call public functions.
  - @confect/core@5.0.0

## 4.0.0

### Minor Changes

- dbefea8: Add `HttpClient`, an Effect service wrapping Convex's `ConvexHttpClient` with automatic schema encoding and decoding. Works in any JavaScript runtime that supports `fetch`.

### Patch Changes

- @confect/core@4.0.0
