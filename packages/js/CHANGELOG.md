# @confect/js

## 6.0.0

### Patch Changes

- df95ce7: Add `Ref.OptionalArgs` type utility to `@confect/core` for conditionally optional function args. `QueryRunner`, `MutationRunner`, and `ActionRunner` now accept optional args for no-arg Confect functions. `useQuery`, `useMutation`, and `useAction` now accept optional args for no-arg Confect functions. `TestConfect` `query`/`mutation`/`action` helpers now accept optional args for no-arg Confect functions.
- Updated dependencies [df95ce7]
- Updated dependencies [a8083e8]
  - @confect/core@6.0.0

## 5.0.0

### Minor Changes

- fb17b7e: Add `WebSocketClient`, a WebSocket-based client wrapping Convex's `ConvexClient`. Provides the same `query`, `mutation`, and `action` methods as `HttpClient`, plus `reactiveQuery` which returns a `Stream` of live query results.

### Patch Changes

- 2c4b0c9: Fix `HttpClient` to only accept public `Ref`s

  `HttpClient` query, mutation, and action methods now correctly reject internal `Ref`s at the type level, matching the runtime behavior of Convex browser clients which can only call public functions.
  - @confect/core@5.0.0

## 4.0.0

### Minor Changes

- dbefea8: Add `HttpClient`, an Effect service wrapping Convex's `ConvexHttpClient` with automatic schema encoding and decoding. Works in any JavaScript runtime that supports `fetch`.

### Patch Changes

- @confect/core@4.0.0
