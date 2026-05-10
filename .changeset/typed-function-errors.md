---
"@confect/core": minor
"@confect/server": minor
"@confect/js": minor
"@confect/react": major
"@confect/test": minor
---

Add typed errors to Confect functions (queries, mutations, and actions). Declare an optional `error` schema in `FunctionSpec` and recover it as a typed value at every call site—`useQuery`, `useMutation`, `useAction`, `HttpClient`, `WebSocketClient`, and `TestConfect`—without paying for it on functions that don't fail.

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
