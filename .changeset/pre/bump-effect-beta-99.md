---
"@confect/core": patch
"@confect/server": patch
"@confect/js": patch
"@confect/react": patch
"@confect/cli": patch
"@confect/test": patch
---

Raise the required `effect` peer version to `^4.0.0-beta.99` (from `^4.0.0-beta.98`).

This is a peer-range-only change with no consumer-visible API consequences. The `beta.99` release only touches `Graph`, CLI (`Command`/`CliConfig`/wizard mode), `Tool` cloning, Redis script eval, and multipart parser internals that Confect doesn't use.
