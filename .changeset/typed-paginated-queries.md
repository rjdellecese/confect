---
"@confect/core": minor
"@confect/react": minor
"@confect/server": minor
---

Add first-class paginated queries. Define them with `FunctionSpec.publicPaginatedQuery` (or `internalPaginatedQuery`), passing your own `args` struct (without `paginationOpts`) and an `item` schema — Confect composes the Convex-facing schemas for you, including the `paginationOpts` argument with all of Convex's pagination protocol fields (via the new `PaginationOptions` schema in `@confect/core`) and a `PaginationResult` returns schema. Handlers receive the decoded `paginationOpts` and can forward it directly to `paginate`, whose options parameter in `@confect/server` now accepts Convex's full `PaginationOptions`.

On the client, `usePaginatedQuery` in `@confect/react` consumes refs built with these constructors and returns a `PaginatedQueryResult<Item, E>` — the loaded variants (`LoadingFirstPage`/`LoadingMore`/`CanLoadMore`/`Exhausted`) all carry `results`, `isLoading`, and `loadMore`, and a declared `error` schema surfaces as a decoded `Failure` variant instead of a render-time throw. `Failure` carries `results` too, so the pages loaded before a failure can still be rendered alongside the error. When no `error` schema is declared, the `Failure` variant is excluded from the type entirely. `@confect/react` now requires `convex` >= 1.36.0.
