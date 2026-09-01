---
"@confect/react": minor
"@confect/server": minor
---

Add `useStreamPaginatedQuery` to `@confect/react` — a paginated query hook for queries built on `QueryStream.paginate`. It has the same call shape and result as `usePaginatedQuery`, but pins each loaded page to a fixed index range, so items never leak between pages or appear twice as documents are inserted and deleted, and each page stays an independently reactive subscription.

```ts
import { useStreamPaginatedQuery } from "@confect/react";

const { results, status, loadMore } = useStreamPaginatedQuery(
  refs.public.notes.feed,
  {},
  { initialNumItems: 10 },
);
```

The hook also splits pages that grow too large: `QueryStream.paginate` now reports `pageStatus: "SplitRecommended"` with a `splitCursor` when a range-pinned page has grown well past its requested size, and the hook responds by splitting that subscription into two smaller pages.
