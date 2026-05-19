---
"@confect/server": patch
---

Fix Convex query cache invalidation when handlers use `Effect.log`, `Effect.withSpan`, or other Effect features that read the clock through its `unsafe*` methods.

The `Clock` provided to confect-wrapped handlers previously implemented `unsafeCurrentTimeMillis`/`unsafeCurrentTimeNanos` by calling the real `Date.now`, so Effect internals (logging, span events, the default scheduler) would read real time during handler execution and invalidate Convex's per-query cache. Those unsafe methods now return constants (`0`/`0n`), making the only opt-in to cache invalidation the user-facing `Clock.currentTimeMillis`/`Clock.currentTimeNanos` effects, as originally intended.
