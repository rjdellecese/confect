---
"@confect/server": major
---

Rename `QueryStream.narrow` endpoint values from `orderKey` to `keyValues`. Existing pagination cursors remain compatible.

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
