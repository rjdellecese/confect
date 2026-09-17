---
"@confect/core": patch
---

Fix function error types widening to `any` when `exactOptionalPropertyTypes` is disabled and no `error` schema is declared. Function refs, handlers, clients, and test helpers now preserve precise error channels under either setting, which may reveal application type errors previously hidden by `any`.
