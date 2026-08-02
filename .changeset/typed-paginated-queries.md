---
"@confect/core": minor
"@confect/react": minor
"@confect/server": minor
---

Add first-class paginated queries: declare one with `FunctionSpec.publicPaginatedQuery` (or `internalPaginatedQuery`) and read it with the new `usePaginatedQuery` hook from `@confect/react`.

Pass an `item` schema — the type of one element in a page — in place of `returns`, plus an optional `args` struct for your own arguments. The handler receives `paginationOpts` alongside them and forwards it to `paginate`.

```ts
// confect/notes.spec.ts
FunctionSpec.publicPaginatedQuery({
  name: "listByAuthor",
  args: () => Schema.Struct({ author: Schema.String }),
  item: () => notes.Doc,
});

// confect/notes.impl.ts
({ author, paginationOpts }) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;

    return yield* reader
      .table("notes")
      .index("by_creation_time", "desc")
      .paginate(paginationOpts, (q) => q.eq(q.field("author"), author));
  }).pipe(Effect.orDie);
```

Declaring `paginationOpts` in `args` yourself is a type and runtime error.

```tsx
import { PaginatedQueryResult, usePaginatedQuery } from "@confect/react";

const notes = usePaginatedQuery(
  refs.public.notes.listByAuthor,
  { author },
  { initialNumItems: 10 },
);

// `notes.results` holds the pages decoded through `item`.
if (PaginatedQueryResult.isCanLoadMore(notes)) {
  notes.loadMore(10);
}
```

The hook returns a `PaginatedQueryResult<Item, E>`. `LoadingFirstPage`, `LoadingMore`, `CanLoadMore`, and `Exhausted` all carry `results` and `isLoading`; `loadMore` lives only on `CanLoadMore`, the one state it can make progress from. A declared `error` schema surfaces as a `Failure` variant carrying the decoded error instead of throwing during render, and `Failure` carries `results` too, so the pages loaded before it can still be rendered. Without an `error` schema, `Failure` is absent from the type entirely.

`paginate` in `@confect/server` now accepts Convex's full `PaginationOptions`, so a handler's `paginationOpts` passes straight through. `@confect/react` now requires `convex` >= 1.36.0.
