# React client integration tests

These tests compose Confect hooks, codecs and optimistic helpers with the real
`ConvexReactClient`. A deterministic WebSocket transport supplies protocol
messages so replay, failure rollback and success reconciliation are exercised
without a backend process. They are not backend or browser end-to-end tests.

Run them with `pnpm exec vitest run --project @confect/react`.
