---
"@confect/server": major
---

Allow inclusive or exclusive endpoints on either side of an experimental `QueryStream.narrow` range, supporting time windows and selections that include or exclude their boundary items.

Replace `after` and `until` with `start` and `end` objects, providing at least one endpoint. Each endpoint requires a `key` and an `inclusive` flag; both follow stream order, including on descending streams. Pagination retains its exclusive-start, inclusive-end behavior.

**Before:**

```ts
QueryStream.narrow(stream, { after: startKey, until: endKey });
```

**After:**

```ts
QueryStream.narrow(stream, {
  start: { key: startKey, inclusive: false },
  end: { key: endKey, inclusive: true },
});
```
