---
"@confect/server": minor
---

Add three operations to `QueryStream`:

- `QueryStream.empty` builds a query stream with no documents but a known order key and direction, so a merge over a dynamic list of streams has something to return when the list is empty: `QueryStream.empty<NotesDoc>()(["_creationTime"], "desc")`.
- `QueryStream.leftJoin` is `flatMap` that keeps outer documents whose inner stream is empty, emitting `onEmpty(outer)` in their place — SQL's `LEFT JOIN` to `flatMap`'s inner join. The placeholder paginates like any element.
- `QueryStream.filterEffect` and `QueryStream.mapEffect` accept `{ concurrency }` to run several documents' effects at once. Elements are still emitted in stream order, so the result remains a query stream.
