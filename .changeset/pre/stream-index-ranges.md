---
"@confect/server": major
---

Rename the endpoint field in `QueryStream.narrow` from `key` to `orderKey`. Preserve index constraints across reused and narrowed streams.

Before:

```ts
QueryStream.narrow(stream, { start: { key: [startTime], inclusive: true } });
```

After:

```ts
QueryStream.narrow(stream, {
  start: { orderKey: [startTime], inclusive: true },
});
```

Apply the same rename to `end` endpoints.
