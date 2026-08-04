---
"@confect/core": patch
"@confect/server": patch
"@confect/js": patch
"@confect/react": patch
"@confect/cli": patch
"@confect/test": patch
---

Raise the required `effect` peer version to `^4.0.0-beta.103` (from `^4.0.0-beta.102`), and `@confect/server`'s optional `@effect/platform-node` peer version likewise.

`beta.103` separates wall-clock time from monotonic elapsed time: `Clock.Clock` now also requires `monotonicTimeNanos` and `monotonicTimeNanosUnsafe`, so a custom `Clock` provided to a Confect function has to supply both. Effects that measure elapsed time — `Effect.timed`, duration metrics, `Sink.withDuration` — read the monotonic accessors instead of the wall clock, and continue to report a zero duration inside queries and mutations, where Confect pins the unsafe accessors to constants to keep Convex's query cache from evicting on every logged span.
