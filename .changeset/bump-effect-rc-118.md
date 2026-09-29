---
"@confect/cli": patch
"@confect/core": patch
"@confect/foldkit": patch
"@confect/js": patch
"@confect/react": patch
"@confect/server": patch
"@confect/test": patch
---

Require `effect@^4.0.0-rc.118` and matching Effect platform packages. Upgrade Effect alongside Confect and replace `effect/unstable/*` imports with `effect/*`, using `effect/http-api` for HTTP API imports.
