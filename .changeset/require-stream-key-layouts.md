---
"@confect/server": major
---

Preserve ID tiebreakers through `QueryStream` joins, empty streams, and renaming. `QueryStream.merge` and `QueryStream.flatMap` reject incompatible orderings, including inner streams produced on later rows or later runs.

### Breaking Changes

- `QueryStream.empty` accepts a compatible stream's `keyLayout` instead of field names.
- `QueryStream.flatMap` replaces `innerKey` with `innerLayout`.

To migrate, reuse the `keyLayout` of a stream with the required ordering. Creating a stream does not read documents. `QueryStream.distinct` and `QueryStream.renameKey` continue to accept label tuples directly.

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
