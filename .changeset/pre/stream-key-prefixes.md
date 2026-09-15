---
"@confect/server": major
---

Use `orderKey` instead of `key` when constructing or reading annotated `QueryStream` elements.

Before:

```ts
const element = { doc, key };
```

After:

```ts
const element = { doc, orderKey };
```

Reject `QueryStream.narrow` bounds wider than the stream’s ordering key before executing a query.
