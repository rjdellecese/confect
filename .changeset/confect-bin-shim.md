---
"@confect/cli": patch
---

Point the `confect` bin at a committed shim instead of the build output directly, so package managers can always create the command shim at install time (previously, installing in a workspace before `dist/` was built could leave the `confect` command missing until a re-install).
