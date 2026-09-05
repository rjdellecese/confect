---
"@confect/react": minor
"@confect/server": minor
---

Add `useStreamPaginatedQuery` to `@confect/react` — a paginated query hook for queries built on `QueryStream.paginate`. It has the same call shape and result as `usePaginatedQuery`, but pins every loaded page (including the first, as soon as it loads) to a fixed index range, so items never leak between pages, appear twice, or drop off the end of a page as documents are inserted and deleted, and each page stays an independently reactive subscription.

```ts
import { useStreamPaginatedQuery } from "@confect/react";

const { results, status, loadMore } = useStreamPaginatedQuery(
  refs.public.notes.feed,
  {},
  { initialNumItems: 10 },
);
```

The options also accept `maximumRowsRead`, a per-page read budget forwarded to the server: on a stream that filters out most of what it reads, a page that would scan more rows than that is returned truncated with `pageStatus: "SplitRequired"` and the hook splits it, instead of the query exceeding Convex's limits.

The hook also splits pages that grow too large: `QueryStream.paginate` now reports `pageStatus: "SplitRecommended"` with a `splitCursor` when a range-pinned page has grown well past its requested size, or when any page had to scan far more rows than it returned, and the hook responds by splitting that subscription into two smaller pages.

When the server reports that a stored cursor no longer matches the query (`paginationError: "InvalidCursor"`), the hook restarts pagination from the first page instead of failing.
