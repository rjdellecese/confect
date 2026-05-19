---
"@confect/core": minor
"@confect/server": minor
"@confect/test": minor
"@confect/js": minor
"@confect/react": minor
---

Bump Convex peer to `^1.39.0` and `convex-test` to `^0.0.53`

**Peer dep change** — `convex` peer is now `^1.39.0` (was `^1.30.0`). Consumers
must upgrade their `convex` to 1.39+.

What's new in Convex since 1.30 that affects confect users:

- **1.31 — explicit-table-id `db.get(table, id)`**: 4-arg variants of
  `db.{get, patch, replace, delete}` now accept an explicit table name. The
  old 1-arg form still works but is soft-deprecated. Confect's
  `DatabaseReader`/`DatabaseWriter` continue to pass-through to native APIs.
- **1.32 — paginate row/byte limits**: `PaginationOptions.maximumRowsRead`
  and `maximumBytesRead` for fine-grained read-limit control. Already wired
  through confect's paginate wrapper.
- **1.32 — pagination filter callback**: `OrderedQuery.paginate(opts, filter)`
  accepts a filter function (already supported by confect's `paginate`).
- **1.36 — `ctx.meta`**: `getFunctionMetadata`, `getTransactionMetrics`.
  **1.37**: `getDeploymentMetadata`. **1.38**: `getRequestMetadata`. Exposed
  as `QueryMeta`, `MutationMeta`, and `ActionMeta` Effect services.
- **1.39 — typed env vars in `defineApp`/`defineComponent`**: exposed through
  `ConvexConfigProvider.fromApp` / `fromComponent` key-safe `Config` helpers.

`convex-test` jumped 0.0.41 → ^0.0.53 (12 patch versions). Two breaking
changes between:

- **0.0.45**: replaced global state with `AsyncLocalStorage`-scoped state.
  `TestConvex<SpecificSchema>` now supports union types in inline calls.
- **0.0.47**: isolated function-stack tracking between parallel calls
  (component module resolution).

Additional fixes picked up: 0.0.46 macrotask-queue scheduling, 0.0.49
ID format normalization, 0.0.50 `ConvexError` deserialization in nested
function calls, 0.0.48/0.0.52 `ctx.meta.*` stubs.
