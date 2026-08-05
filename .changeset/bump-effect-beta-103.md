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

The release also moves synchronous Effect runs off `setImmediate`/`setTimeout` and onto the microtask queue, which Convex's query and mutation isolate permits. Confect no longer suppresses cooperative fiber yielding for the synchronous work it performs while your modules load — registration and schema-to-validator compilation — and relies on that scheduling instead. Neither the "Can't use `setTimeout` in queries and mutations" crash nor any other consumer-visible behavior changes, but this is the area to look at if module loading starts misbehaving on `beta.103`.
