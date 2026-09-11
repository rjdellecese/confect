---
"@confect/core": major
"@confect/server": major
"@confect/cli": minor
"@confect/foldkit": minor
"@confect/react": minor
"@confect/js": patch
---

Add experimental stream querying with reactive pagination, configurable middleware policies, and broader tracing.

### Stream queries and pagination

Create composable Effect streams with `reader.table(...).stream(index, range?, order?)` and `QueryStream` from `@confect/server`. Merge, filter, map, join, deduplicate, narrow, and reverse queries without losing cursor pagination. Order keys and directions are checked by the type system. Joins support left-join placeholders through `onEmpty`, and effectful filters and maps support ordered concurrency. Reversing a distinct stream preserves its chosen representatives.

`QueryStream.paginate` resumes from indexed cursor bounds and supports pinned page ranges, automatic split recommendations, and `maximumRowsRead` / `maximumBytesRead` budgets that count underlying query-stream reads, including filtered documents. Byte counts are estimates. If a budget prevents safe progress or splitting, pagination fails with `ReadBudgetExceededError`; increase the budget or reduce the query's read requirements.

Use React's new `useStreamPaginatedQuery` for these queries:

```ts
import { useStreamPaginatedQuery } from "@confect/react";

const { results, status, loadMore } = useStreamPaginatedQuery(
  refs.public.notes.feed,
  {},
  { initialNumItems: 10, maximumRowsRead: 1000, maximumBytesRead: 512 * 1024 },
);
```

The hook pins loaded pages to fixed ranges, splits oversized or budget-limited pages, and restarts pagination on invalid cursors. Foldkit's `PaginatedQuery` also supports stream queries and preserves page ranges when navigating back and forward, avoiding skipped or repeated documents as data changes.

Stream cursors expose their order-key values. Do not paginate publicly over sensitive indexed fields unless they are pinned with `eq`. All `QueryStream` APIs are experimental.

### Middleware options

Declare a lazy `options` schema on `MiddlewareSpec.MiddlewareSpec`, then pass typed values with `.middleware(Policy, options)` on functions or groups. Options are validated without coercion during codegen and server registration; keep schemas and values client-safe because generated refs carry them.

The same policy can be attached repeatedly with non-equivalent options. Every attachment runs, with group policies before function policies. Equivalent options and duplicate policies without options are rejected. Register implementations against the same spec used for attachments.

### Breaking changes

Middleware callbacks passed to `MiddlewareImpl.make` or `MiddlewareImpl.makeByFunctionType` receive invocation metadata under `invocation`. To migrate, nest destructuring of `name`, `functionType`, `functionVisibility`, and decoded `args`:

**Before:**

```ts
(effect, { name, args }) => effect;
```

**After:**

```ts
(effect, { invocation: { name, args } }) => effect;
```

Middleware with an options schema also receives `options` alongside `invocation`; middleware without one keeps its single-argument attachment API and receives only `{ invocation }`.

### Fixes and tracing

- Preserve `ConvexError.data` when a handler throws a `ConvexError` inside an Effect instead of returning it as a typed failure.
- Add named tracing spans for JavaScript client calls, server function execution, database writes and pagination, `QueryStream.unique` / `QueryStream.paginate`, and `confect codegen` / `confect dev` code-generation passes.
