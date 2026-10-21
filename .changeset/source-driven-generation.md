---
"@confect/cli": patch
---

Keep `confect codegen` and `confect dev` consistent when inherited TypeScript configurations change. Restart dev automatically for configuration and package-resolution changes, while keeping ordinary source edits incremental and avoiding regeneration for unchanged inputs.

Fix `${configDir}` aliases with wildcard matches followed by `..` so they resolve to the matched directory's parent.
