---
"@confect/cli": patch
---

Fix `confect codegen` and `confect dev` failing to load `convex/convex.config.ts` when an installed component's own definition installs other components (e.g. `@convex-dev/resend`, which nests rate-limiter and workpool components).

Previously, evaluating the config threw "Component definition does not have the required componentDefinitionPath property. This code only works in Convex runtime." Component definitions are now recognized recursively, so components may nest other components to any depth.
