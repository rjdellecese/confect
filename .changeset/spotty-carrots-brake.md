---
"@confect/server": patch
---

Fix `StorageWriter.generateUploadUrl` and `StorageReader.getUrl` dying with `SchemaError: Expected URL, got "https://…"` on the URL strings Convex returns. Effect 4's `Schema.URL` is an `instanceof URL` check (in Effect 3 it was a string→URL transform), so the storage services now decode with `Schema.URLFromString` instead.

`Schema.URLFromString` relies on `URL.canParse`, which the Convex UDF isolate's `URL` polyfill doesn't implement — so `@confect/server` now installs a spec-compliant `URL.canParse` polyfill when it's missing. The polyfill loads with the package's entry modules, so it also covers user schemas that use `Schema.URLFromString` (or `URL.canParse` directly) inside Convex queries and mutations.
