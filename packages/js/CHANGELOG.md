# @confect/js

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
