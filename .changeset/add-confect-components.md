---
"@confect/core": minor
"@confect/server": minor
"@confect/cli": minor
"@confect/test": minor
---

Add component authoring with `confect codegen --component-dir` and `confect dev --component-dir`, generating scope-aware IDs, component-specific handler services, and a public contract that can be bound to installed instances with `Component.bind`.

Published components remain callable from vanilla Convex using encoded values. Confect callers retain decoded arguments, results, and typed errors, while IDs from different component installations are distinct types. Use `Component.id` and `Component.schema` to reference component IDs in application schemas, `HttpRouter.forSchema` for component-aware HTTP handlers, and `TestConfect.registerComponent` to register components in tests.
