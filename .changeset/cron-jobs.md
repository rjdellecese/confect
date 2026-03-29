---
"@confect/server": major
"@confect/cli": major
---

Add Effect-native cron job support via new `CronJob` and `CronJobs` modules.

Cron jobs are now defined using Effect's `Cron` (cron expressions) or `Duration` (fixed intervals) types instead of the vanilla Convex `cronJobs()` API. `CronJob.make` creates individual jobs with a unique identifier, schedule, and ref to an internal mutation or action. `CronJobs.make()` creates an empty collection with a chainable `.add()` method.

Interval schedules are represented in the largest whole unit possible (hours > minutes > seconds) to avoid floating-point precision issues with large durations.
