---
"@confect/server": major
"@confect/cli": major
---

Standardize all Effect service tags to a consistent `@confect/{package}/{ServiceName}` format.

**Breaking:** The `Storage` namespace export has been removed from `@confect/server`. `StorageReader`, `StorageWriter`, `StorageActionWriter`, and `BlobNotFoundError` are now exported as individual top-level namespaces. Replace `Storage.StorageReader` with `StorageReader.StorageReader`, etc.

The three storage service classes have been split from `Storage.ts` into their own files (`StorageReader.ts`, `StorageWriter.ts`, `StorageActionWriter.ts`, `BlobNotFoundError.ts`). CLI service classes have been moved out of the `services/` subdirectory to flatten their tags from `@confect/cli/services/ProjectRoot` to `@confect/cli/ProjectRoot`.
