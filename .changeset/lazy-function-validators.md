---
"@confect/server": patch
---

Reduce function startup work by compiling Convex argument and return validators only when they are requested for deployment analysis or backend tests.
