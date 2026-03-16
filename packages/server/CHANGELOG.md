# @confect/server

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
