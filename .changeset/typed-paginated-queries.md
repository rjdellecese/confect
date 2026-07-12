---
"@confect/core": minor
"@confect/react": minor
---

Add typed paginated query support to `@confect/react` with `usePaginatedQuery`, including typed paginated args, result items, and pagination options. Add supporting pieces to `@confect/core`: a `PaginationOptions` schema for declaring the `paginationOpts` arg (including the protocol fields Convex's client sends, like `id` and `endCursor`), the `AnyPublicPaginatedQuery` ref type, and helpers for encoding paginated args and decoding result pages.
