---
"@confect/server": major
---

Align `QueryStream` property names with their types.

### Breaking Changes

- Rename the `QueryStream.flatMap` option `innerLayout` to `innerKeyLayout`.
- Rename a query stream's `order` property to `orderDirection`.
- Rename structured stream-error fields to `expectedKeyLayout`, `actualKeyLayout`, `expectedOrderDirection`, and `actualOrderDirection`, as applicable.

To migrate, pass `{ innerKeyLayout: source.keyLayout }` to `QueryStream.flatMap` and read `stream.orderDirection` when inspecting a stream's direction.

**Before:**

```ts
QueryStream.flatMap(commentsOn, { innerLayout: source.keyLayout });
source.order;
```

**After:**

```ts
QueryStream.flatMap(commentsOn, { innerKeyLayout: source.keyLayout });
source.orderDirection;
```
