# @confect/server

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
