---
"@confect/server": minor
---

Add `Scheduler.cancel(id)` to cancel a scheduled function using the ID returned by `runAfter` or `runAt`. Cancellation failures surface as a typed `SchedulerCancelError` carrying the scheduled-function ID and original cause.
