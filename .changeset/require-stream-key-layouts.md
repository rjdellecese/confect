---
"@confect/server": major
---

Use `QueryStreamKeyLayout` to preserve visible ordering labels and implicit IDs through empty streams, nested joins, and pagination. `QueryStream.merge` and every returned inner stream now reject mismatched implicit-ID positions as well as mismatched labels and directions.

### Breaking Changes

- `QueryStream.empty` accepts a layout instead of field names.
- `QueryStream.flatMap` replaces `innerKey` with `innerLayout`.
- `QueryStreamKeyLayout` replaces `QueryStreamKeyFields`. Construct layouts with `fromIndex(fieldPaths, eqCount)`, compose them with `concat`, and relabel them with `rename`. Use `visibleLabels` to obtain a `QueryStreamKeyLabels` value and `QueryStreamKeyLabels.toArray` to inspect its names. Pass labels values to layout `rename` and `resolvePrefix`; construct them with `QueryStreamKeyLabels.make(["author", "created"])`. Stream `renameKey` and `distinct` continue to accept literal tuples. The public constructor, `Names`, `Equivalence`, `names`, and `drop` are removed.
- `QueryStreamCursor.codecForLayout(stream.keyLayout)` replaces `codecForKeyFields(stream.keyFields)`. The stream's raw `keyFields` getter is removed. Serialized cursors retain the version-1 envelope and its `keyFields` property.
- Reflection data uses `indexFieldPaths` instead of `indexFields` for source document paths.

To migrate, reuse a compatible stream's `keyLayout`, or construct a scan layout from its source index field paths. For nested inner joins, supply the joined stream's layout or compose its component layouts with `QueryStreamKeyLayout.concat`.

**Before:**

```ts
QueryStream.empty<NotesDoc>()(["_creationTime"]);
QueryStream.flatMap(notes, commentsOn, { innerKey: ["_creationTime"] });
QueryStreamCursor.codecForKeyFields(notes.keyFields);
```

**After:**

```ts
import {
  QueryStream,
  QueryStreamCursor,
  QueryStreamKeyLayout,
} from "@confect/server";

const layout = QueryStreamKeyLayout.fromIndex(["_creationTime"]);
QueryStream.empty<NotesDoc>()(layout);
QueryStream.flatMap(notes, commentsOn, { innerLayout: layout });
QueryStreamCursor.codecForLayout(notes.keyLayout);
```
