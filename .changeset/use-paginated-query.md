---
"@confect/core": minor
"@confect/react": minor
"@confect/server": minor
---

Add `usePaginatedQuery` hook to `@confect/react` and a `PaginationOptions` schema to `@confect/core`.

Use `PaginationOptions.PaginationOptions` as the schema for the `paginationOpts` arg in a paginated query spec, then call `usePaginatedQuery(ref, args, { initialNumItems })` from your component to load pages reactively. Args are encoded and page items decoded through the spec's Effect Schemas, exactly like the other Confect hooks.

The `OrderedQuery.paginate` server method now accepts the full Convex `PaginationOptions` (including `endCursor`, `id`, `maximumRowsRead`, and `maximumBytesRead`) instead of only `cursor` and `numItems`. This is required for the reactive paginated query subscription used by `usePaginatedQuery`.
