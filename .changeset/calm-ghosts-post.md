---
"@confect/server": major
---

Throw an error when a cron schedule specifies a non-UTC timezone

Convex evaluates all cron expressions in UTC, so specifying a timezone has no effect. Previously, a non-UTC timezone was silently ignored, which could produce a job that ran at the wrong time.

To prevent this silent misbehavior, a cron that specifies a non-UTC timezone now throws an error.
