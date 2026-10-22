---
"@confect/server": patch
---

Compile function `args` and `returns` validators only when Convex reads them during a push, instead of every time a function's module loads.
