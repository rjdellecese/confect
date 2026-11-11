---
"@confect/server": minor
---

Require regenerating existing Confect service modules after upgrading. Run `confect codegen` before typechecking or deploying your application; previously generated context-service types are no longer compatible with `@confect/server`.
