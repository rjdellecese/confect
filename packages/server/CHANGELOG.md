# @confect/server

## 5.0.0

### Minor Changes

- 8853cbf: Update `Scheduler` to accept Confect `Ref`s instead of Convex `SchedulableFunctionReference` values. `runAfter` and `runAt` now take a `Ref` to a mutation or action with typed args, aligning the Scheduler API with all other Confect function-calling APIs.

### Patch Changes

- @confect/core@5.0.0

## 4.0.0

### Major Changes

- 60be7e6: Add Effect-native cron job support via new `CronJob` and `CronJobs` modules.

  Cron jobs are now defined using Effect's `Cron` (cron expressions) or `Duration` (fixed intervals) types instead of the vanilla Convex `cronJobs()` API. `CronJob.make` creates individual jobs with a unique identifier, schedule, and ref to an internal mutation or action. `CronJobs.make()` creates an empty collection with a chainable `.add()` method.

  Interval schedules are represented in the largest whole unit possible (hours > minutes > seconds) to avoid floating-point precision issues with large durations.

- 8ae4d51: Standardize all Effect service tags to a consistent `@confect/{package}/{ServiceName}` format.

  The `Storage` namespace export has been removed from `@confect/server`. `StorageReader`, `StorageWriter`, `StorageActionWriter`, and `BlobNotFoundError` are now exported as individual top-level namespaces. Replace `Storage.StorageReader` with `StorageReader.StorageReader`, etc. After upgrading, rerun `confect codegen` to regenerate the `services.ts` file.

### Minor Changes

- 641fd99: Add optional `filter` parameter to `OrderedQuery.paginate`. This allows applying a Convex filter directly at the pagination level — the one scenario where `.filter()` is recommended over index-based filtering. The filter callback receives a `FilterBuilder` and is applied to the underlying query before paginating.

### Patch Changes

- @confect/core@4.0.0

## 3.0.0

### Minor Changes

- 5fb6a61: Add support for plain Convex functions. Plain Convex queries, mutations, and actions can now be included in your Confect spec and impl tree using new `FunctionSpec.convexPublic*` and `FunctionSpec.convexInternal*` constructors. This enables interop with Convex components and libraries (such as Workpool, Workflow, Migrations, and Better Auth) that require user-defined or -provided Convex functions.

### Patch Changes

- Updated dependencies [5fb6a61]
  - @confect/core@3.0.0

## 2.0.0

### Minor Changes

- f78c58a: Add support for `Config` usage in Convex runtime functions. Effect's default `ConfigProvider` doesn't work because `process.env` is not enumerable in the Convex runtime. The new `ConvexConfigProvider` supports the same options as Effect's default `ConfigProvider.fromEnv`, but is also provided to Convex runtime functions by default. Configs which require enumeration are still unsupported, until/unless this Convex runtime limitation is removed.

### Patch Changes

- 69ce9c9: Improve type-checking performance of `SchemaToValidator` compilation.
  - @confect/core@2.0.0

## 1.0.3

### Patch Changes

- @confect/core@1.0.3

## 1.0.2

### Patch Changes

- c4f9d67: Fix return types of `MutationRunner` and `ActionRunner` services
  - @confect/core@1.0.2

## 1.0.1

### Patch Changes

- Updated dependencies [00b12a0]
  - @confect/core@1.0.1

## 1.0.0

### Major Changes

- 2ff70a7: Initial release.

## 1.0.0-next.4

### Patch Changes

- 46109fb: Support Node actions
- Updated dependencies [46109fb]
  - @confect/core@1.0.0-next.4

## 1.0.0-next.3

### Patch Changes

- 9cd3cda: `confect/_generated/refs.ts` now default exports the `Refs` object, which now contains `public` and `internal` fields for each corresponding collection of Confect functions
- 186c130: `FunctionSpec.query` becomes `FunctionSpec.publicQuery`, same for mutations and actions
- Updated dependencies [9cd3cda]
- Updated dependencies [186c130]
  - @confect/core@1.0.0-next.3

## 1.0.0-next.2

### Patch Changes

- 071b6ed: Upgrade deps
- afc9fb4: Refactor `DatabaseWriter` API to match `DatabaseReader` (`writer.insert("notes", { text })` becomes `writer.table("notes").insert({ text })`, and so on)
- Updated dependencies [071b6ed]
  - @confect/core@1.0.0-next.2

## 1.0.0-next.1

### Patch Changes

- Updated dependencies [5a4127f]
  - @confect/core@1.0.0-next.1

## 1.0.0-next.0

### Major Changes

- 2ff70a7: Initial release.

### Patch Changes

- Updated dependencies [2ff70a7]
  - @confect/core@1.0.0-next.0
