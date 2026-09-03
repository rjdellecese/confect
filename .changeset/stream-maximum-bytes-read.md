---
"@confect/server": minor
"@confect/react": minor
---

Enforce `maximumBytesRead` in `QueryStream.paginate`, and accept it as an option of `useStreamPaginatedQuery`.

`QueryStream.paginate` now charges the estimated size of every document its index queries read, filtered or not, against `paginationOpts.maximumBytesRead`; when the budget is hit the page returns what it has so far with `pageStatus: "SplitRequired"` and a `splitCursor`, just as `maximumRowsRead` does. Previously the option was accepted and ignored.

`useStreamPaginatedQuery` forwards a `maximumBytesRead` option to every page alongside `maximumRowsRead`, and splits a page the server truncates for exceeding it.

```ts
const { results, status, loadMore } = useStreamPaginatedQuery(
  refs.public.notes.feed,
  {},
  { initialNumItems: 10, maximumBytesRead: 512 * 1024 },
);
```
