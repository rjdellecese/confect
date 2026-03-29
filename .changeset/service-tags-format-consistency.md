---
"@confect/server": major
"@confect/cli": major
---

Standardize all Effect service tags to a consistent `@confect/{package}/{ServiceName}` format.

The `Storage` namespace export has been removed from `@confect/server`. `StorageReader`, `StorageWriter`, `StorageActionWriter`, and `BlobNotFoundError` are now exported as individual top-level namespaces. Replace `Storage.StorageReader` with `StorageReader.StorageReader`, etc. After upgrading, rerun `confect codegen` to regenerate the `services.ts` file.
