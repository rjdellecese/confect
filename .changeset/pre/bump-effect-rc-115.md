---
"@confect/cli": patch
"@confect/core": patch
"@confect/foldkit": patch
"@confect/js": patch
"@confect/react": patch
"@confect/server": patch
"@confect/test": patch
---

Require `effect@^4.0.0-rc.115` across `@confect/*` and `@effect/platform-node@^4.0.0-rc.115` when using `@confect/server`'s optional Node integration. Upgrade these dependencies alongside Confect; existing Confect call sites are unchanged.
