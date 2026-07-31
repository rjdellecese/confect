---
"@confect/server": patch
---

Fix `StorageWriter.generateUploadUrl` and `StorageReader.getUrl` dying with `SchemaError: Expected URL, got "https://…"` on the URL strings Convex returns. Effect 4's `Schema.URL` is an `instanceof URL` check (in Effect 3 it was a string→URL transform), so the storage services now decode with `Schema.URLFromString` instead.
