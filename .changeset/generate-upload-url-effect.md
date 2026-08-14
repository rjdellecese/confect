---
"@confect/server": major
---

`StorageWriter.generateUploadUrl` is now an `Effect` rather than a function returning one. Yield it directly instead of calling it.

Before:

```ts
const url = yield * storage.generateUploadUrl();
```

After:

```ts
const url = yield * storage.generateUploadUrl;
```

`StorageWriter.delete` is unchanged — it takes a storage ID, so it remains a function.
