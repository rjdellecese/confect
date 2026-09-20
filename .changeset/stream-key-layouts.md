---
"@confect/server": major
---

Preserve ID tiebreakers through `QueryStream` joins, empty streams, and renaming, and use `keyValues` for bounds and annotated elements. `QueryStream.merge` and `QueryStream.flatMap` reject incompatible orderings, including inner streams produced on later rows or later runs. Reused and narrowed streams preserve their index constraints, and `QueryStream.narrow` rejects bounds wider than the stream's ordering key before executing a query.

### Breaking Changes

- `QueryStream.narrow` endpoints and annotated elements replace `key` with `keyValues`.
- `QueryStream.empty` accepts a compatible stream's `keyLayout` instead of field names.
- `QueryStream.flatMap` replaces `innerKey` with `innerLayout`.
- Explicit `QueryStream` type annotations require branded ordering labels instead of plain label tuples. Inferred stream types need no changes.
- `QueryStream.paginate` uses a new cursor format. Restart pagination with `cursor: null` after upgrading; continuation cursors from earlier prereleases are no longer accepted.

To migrate from the previous prerelease, replace `key` with `keyValues` in each `start` and `end` endpoint and when constructing or reading annotated elements.

**Before:**

```ts
QueryStream.narrow(stream, {
  start: { key: [startTime], inclusive: true },
  end: { key: [endTime], inclusive: false },
});
const element = { doc, key };
```

**After:**

```ts
QueryStream.narrow(stream, {
  start: { keyValues: [startTime], inclusive: true },
  end: { keyValues: [endTime], inclusive: false },
});
const element = { doc, keyValues: key };
```

For empty streams and joins, reuse the `keyLayout` of a stream with the required ordering. Creating a stream does not read documents. `QueryStream.distinct` and `QueryStream.renameKey` continue to accept label tuples directly.

**Before:**

```ts
QueryStream.empty<NotesDoc>()(["_creationTime"]);
QueryStream.flatMap(notes, commentsOn, { innerKey: ["_creationTime"] });
```

**After:**

```ts
import { QueryStream } from "@confect/server";

const byTime = reader.table("notes").stream("by_creation_time");
QueryStream.empty<NotesDoc>()(byTime.keyLayout);

const commentsByTime = reader.table("comments").stream("by_creation_time");
QueryStream.flatMap(notes, commentsOn, {
  innerLayout: commentsByTime.keyLayout,
});
```

Prefer deriving stream type aliases from an inferred stream, such as `type NoteStream = typeof byTime`, rather than spelling out the ordering-label type parameter.
