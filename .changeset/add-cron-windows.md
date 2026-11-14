---
"@confect/server": minor
---

Add `CronWindow.hourly()`, `.daily({ hourUtc })`, `.weekly({ dayOfWeek, hourUtc })`, and `.monthly({ day, hourUtc })` for recurring UTC hours in which Convex chooses the minute. Pass a `CronWindow` to `CronJob.make` alongside existing Effect `Cron` and `Duration` schedules.
