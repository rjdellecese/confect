---
"@confect/cli": minor
---

Fix `confect codegen` and `confect dev` failing to start with Effect 4.1, and preserve dependency tracking and build warnings on Windows. Upgrade `effect` to `~4.1.0` alongside the CLI; the CLI's Effect and `@effect/platform-node` ranges now admit only 4.1.x releases because they use APIs that may break between minor versions.
