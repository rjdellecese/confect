---
"@confect/server": major
---

Rename `QueryStream.narrow` endpoint values from `orderKey` to `keyValues` and require branded ordering labels in explicit `QueryStream` type annotations.

Change the cursor format returned by `QueryStream.paginate`. Restart pagination with `cursor: null` after upgrading; cursors from earlier prereleases are no longer accepted.

Replace `orderKey` with `keyValues` in each `start` and `end` endpoint.

**Before:**

```ts
QueryStream.narrow(stream, {
  start: { orderKey: [startTime], inclusive: true },
  end: { orderKey: [endTime], inclusive: false },
});
```

**After:**

```ts
QueryStream.narrow(stream, {
  start: { keyValues: [startTime], inclusive: true },
  end: { keyValues: [endTime], inclusive: false },
});
```

For explicit stream type annotations, wrap the label tuple in `QueryStreamKeyLabels`. You can still write these types by hand; no runtime construction is required. Calls to `QueryStream.distinct` and `QueryStream.renameKey` still accept ordinary tuples.

**Before:**

```ts
type NoteStream = QueryStream<Note, ["text", "_creationTime"], "asc">;
```

**After:**

```ts
import type { QueryStreamKeyLabels } from "@confect/server/QueryStreamKeyLabels";

type NoteStream = QueryStream<
  Note,
  QueryStreamKeyLabels<["text", "_creationTime"]>,
  "asc"
>;
```
