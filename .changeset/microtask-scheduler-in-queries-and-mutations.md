---
"@confect/server": patch
---

Run query and mutation handlers on an Effect `Scheduler` that dispatches cooperative fiber yields on the microtask queue. Effect's default `MixedScheduler` dispatches yields — injected once a fiber exhausts its op budget (`MaxOpsBeforeYield`, 2048 operations) — through `setImmediate`, falling back to `setTimeout(f, 0)`; neither exists in Convex's query/mutation isolate, so any sufficiently long-running handler crashed with Convex's "Can't use setTimeout in queries and mutations" error. The scheduler is installed via `Effect.runPromise` run options so it sits in the fiber's root context and also covers Confect's own error-encoding wrappers. Actions are unchanged — timers are allowed there.
