---
"@confect/server": minor
---

Update `Scheduler` to accept Confect `Ref`s instead of Convex `SchedulableFunctionReference` values. `runAfter` and `runAt` now take a `Ref` to a mutation or action with typed args, aligning the Scheduler API with all other Confect function-calling APIs.
