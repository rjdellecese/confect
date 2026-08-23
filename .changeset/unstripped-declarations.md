---
"@confect/core": minor
"@confect/server": minor
---

Stop stripping `@internal` members from the published type declarations. `@confect/core`'s ref types (`Ref.ConfectRef` / `Ref.ConvexRef`) now declare all of their members, so the `Ref.Ref` union can be narrowed by its `_tag`, and `@confect/server`'s `CronJobs.cronToConvexCronString` and `CronJobs.durationToConvexIntervalSchedule` — previously exported at runtime but absent from the declarations — are now typed.
