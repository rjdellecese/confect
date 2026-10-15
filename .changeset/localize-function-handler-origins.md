---
"@confect/cli": patch
"@confect/server": patch
---

Reduce Convex deployment analysis overhead for generated functions while retaining source maps and existing validation and handler behavior. After upgrading, regenerate with `confect codegen` or `confect dev` before typechecking or deploying existing projects.
