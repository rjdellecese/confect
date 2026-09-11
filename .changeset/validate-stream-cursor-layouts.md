---
"@confect/server": major
---

Reject incompatible order-key layouts in `QueryStream.paginate` with `InvalidCursor`, so stream pagination clients restart instead of resuming at an unrelated position.

### Breaking Changes

- Previously issued stream cursors are no longer accepted. Restart pagination from `cursor: null`; `useStreamPaginatedQuery` handles the `InvalidCursor` signal automatically.
- Manually created cursors must include the stream's runtime field names.

**Before:**

```ts
QueryStream.serializeCursor(key);
```

**After:**

```ts
QueryStream.serializeCursor(key, stream.keyFields);
```

`QueryStream.deserializeCursor(cursor, stream.keyFields)` also checks the expected layout when decoding a cursor for manual narrowing. Layout validation does not detect changes to filters, pinned values, or field semantics.
