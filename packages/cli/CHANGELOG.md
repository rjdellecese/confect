# @confect/cli

## 3.0.0

### Minor Changes

- 5fb6a61: Add support for plain Convex functions. Plain Convex queries, mutations, and actions can now be included in your Confect spec and impl tree using new `FunctionSpec.convexPublic*` and `FunctionSpec.convexInternal*` constructors. This enables interop with Convex components and libraries (such as Workpool, Workflow, Migrations, and Better Auth) that require user-defined or -provided Convex functions.

### Patch Changes

- Updated dependencies [5fb6a61]
  - @confect/core@3.0.0
  - @confect/server@3.0.0

## 2.0.0

### Patch Changes

- Updated dependencies [69ce9c9]
- Updated dependencies [f78c58a]
  - @confect/server@2.0.0
  - @confect/core@2.0.0

## 1.0.3

### Patch Changes

- 12b465a: Confect no longer maintains an `app.ts` which maps to `convex.config.ts`. If you'd like to use Convex components, define a `convex.config.ts` file in your `convex/` folder directly.
  - @confect/server@1.0.3
  - @confect/core@1.0.3

## 1.0.2

### Patch Changes

- Updated dependencies [c4f9d67]
  - @confect/server@1.0.2
  - @confect/core@1.0.2

## 1.0.1

### Patch Changes

- d3ecdc7: Fix codegen failure in projects without `"type": "module"` in their `package.json`. Also dramatically improve codegen performance.
- Updated dependencies [00b12a0]
  - @confect/core@1.0.1
  - @confect/server@1.0.1

## 1.0.0

### Major Changes

- 2ff70a7: Initial release.

## 1.0.0-next.4

### Patch Changes

- 46109fb: Support Node actions
- Updated dependencies [46109fb]
  - @confect/server@1.0.0-next.4
  - @confect/core@1.0.0-next.4

## 1.0.0-next.3

### Patch Changes

- 9cd3cda: `confect/_generated/refs.ts` now default exports the `Refs` object, which now contains `public` and `internal` fields for each corresponding collection of Confect functions
- 186c130: `FunctionSpec.query` becomes `FunctionSpec.publicQuery`, same for mutations and actions
- Updated dependencies [9cd3cda]
- Updated dependencies [186c130]
  - @confect/server@1.0.0-next.3
  - @confect/core@1.0.0-next.3

## 1.0.0-next.2

### Patch Changes

- 071b6ed: Upgrade deps
- Updated dependencies [071b6ed]
- Updated dependencies [afc9fb4]
  - @confect/server@1.0.0-next.2
  - @confect/core@1.0.0-next.2

## 1.0.0-next.1

### Patch Changes

- Updated dependencies [5a4127f]
  - @confect/core@1.0.0-next.1
  - @confect/server@1.0.0-next.1

## 1.0.0-next.0

### Major Changes

- 2ff70a7: Initial release.

### Patch Changes

- Updated dependencies [2ff70a7]
  - @confect/server@1.0.0-next.0
