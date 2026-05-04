---
"@confect/core": minor
"@confect/server": minor
"@confect/js": minor
"@confect/react": major
"@confect/test": minor
---

Add typed function errors via an optional `error: Schema` field on `FunctionSpec.publicQuery` / `publicMutation` / `publicAction` (and their `internal*` and `*NodeAction` variants). Handlers can now fail with values of the declared error type — typically an `Effect.TaggedError` — and Confect surfaces the decoded error in the Effect `E` channel at every consumer call site.

When a handler fails with a typed error, Confect schema-encodes the error data and throws as a `ConvexError` so vanilla Convex tooling sees a normal failure. `QueryRunner`, `MutationRunner`, and `ActionRunner` then decode the error back into the Effect `E` channel of any calling Confect handler, so nested calls retain typed-error semantics. `@confect/test`'s `query` / `mutation` / `action` and `@confect/js`'s `HttpClient` / `WebSocketClient` (including `reactiveQuery`) all expose the typed error in their respective `E` channels alongside `ParseResult.ParseError` and any client-specific transport error.

`@confect/react`'s `useQuery` returns a dedicated `QueryResult<A, E>` type, shaped for Convex subscriptions:

- **`{ _tag: "Loading", skipped }`** — no data from Convex yet. `skipped` is `true` when the second argument was `"skip"`, letting you distinguish a deliberately-skipped subscription from one waiting for its first value.
- **`{ _tag: "Success", value }`** — decoded `returns` value.
- **`{ _tag: "Failure", error }`** — the query threw a `ConvexError` whose payload matches the ref's `error` schema; `error` is the decoded typed error.

If the failure is not a matching typed error (including refs without an `error` schema), or client-side args/returns decoding throws, **`useQuery` rethrows** so you can recover with a React error boundary (or treat it like other unexpected render errors). Use `QueryResult.match` (whose `onLoading` callback receives `skipped`), or `isLoading` / `isSuccess` / `isFailure`. These are available either via the `QueryResult` namespace export from `@confect/react` or as a dedicated subpath import from `@confect/react/QueryResult`.

**Before:**

```tsx
import { useQuery } from "@confect/react";
import refs from "../confect/_generated/refs";

const note = useQuery(refs.public.notes.get, { noteId });

if (note === undefined) return <p>Loading…</p>;
return <p>{note.text}</p>;
```

**After** (where `getOrFail`'s spec declares `error: Schema.Union(NotFound, Forbidden)`):

```tsx
import { QueryResult, useQuery } from "@confect/react";
import { Match } from "effect";
import refs from "../confect/_generated/refs";

const note = useQuery(refs.public.notes.getOrFail, { noteId });

return QueryResult.match(note, {
  onLoading: () => <p>Loading…</p>,
  onSuccess: (value) => <p>{value.text}</p>,
  onFailure: (error) =>
    Match.value(error).pipe(
      Match.tag("NotFound", (e) => <p>Note {e.id} not found.</p>),
      Match.tag("Forbidden", (e) => <p>Forbidden: {e.reason}</p>),
      Match.exhaustive,
    ),
});
```

For infrastructure or contract violations outside the typed-error channel, use an error boundary (or avoid calling the hook in a state that can throw, if applicable).

`useMutation` and `useAction` now return `(args) => Promise<Either<Returns, Ref.Error<Ref>>>` instead of `(args) => Promise<Returns>`. `Either.Right` carries the decoded return value; `Either.Left` carries the decoded typed error for `ConvexError`s whose payload matches the ref's `error` schema. Anything else — network failures, contract-violating `ConvexError`s on schema-less refs, or args/returns schema decode failures — rejects the Promise with the original error so plain `try` / `catch` can recover. Use `Either.match` plus `Match.tags` for exhaustive dispatch on the typed error:

```tsx
import { useMutation } from "@confect/react";
import { Either, Match } from "effect";
import refs from "../confect/_generated/refs";

const deleteNote = useMutation(refs.public.notes.deleteOrFail);

const onClick = async (noteId: string) => {
  const result = await deleteNote({ noteId });

  Either.match(result, {
    onRight: () => {
      /* navigate, toast, etc. */
    },
    onLeft: (error) =>
      Match.value(error).pipe(
        Match.tag("NotFound", (e) => /* render NotFound */ undefined),
        Match.tag("Forbidden", (e) => /* render Forbidden */ undefined),
        Match.exhaustive,
      ),
  });
};
```

### Breaking changes

- `useQuery` now returns `QueryResult<Returns, Ref.Error<Query>>` (`Loading` with `skipped`, `Success`, `Failure`) instead of `T | undefined`. Typed failures use `onFailure` / `Failure.error`; everything outside the typed-error contract throws from the hook (handle with an error boundary). Migrate with `QueryResult.match` or `QueryResult.isLoading` / `isSuccess` / `isFailure`. Import from the `QueryResult` namespace re-exported from `@confect/react` or directly from `@confect/react/QueryResult`.
- `useMutation` and `useAction` now return `(args) => Promise<Either<Returns, Ref.Error<Ref>>>` instead of `(args) => Promise<Returns>`. `Either.Right` carries the decoded return value; `Either.Left` carries the decoded typed error. Everything else rejects the Promise with the original error. To migrate: replace `await mutate(args)` with `Either.match(await mutate(args), { onRight, onLeft })` (or `Either.isRight` / `Either.isLeft`); add a surrounding `try` / `catch` if you also want to handle infrastructure failures.
- `@confect/test`'s `convex-test` peer dependency is now `^0.0.50` (was `^0.0.38`), which fixes upstream `ConvexError.data` deserialization across function-boundary crossings.
