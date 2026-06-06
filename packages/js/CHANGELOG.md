# @confect/js

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
