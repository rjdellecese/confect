---
"@confect/server": patch
---

Fix the remaining "Can't use setTimeout in queries and mutations" crash for apps whose function registration or schema compilation performs enough Effect operations to trigger a cooperative fiber yield. Convex evaluates a function's modules inside the same timer-restricted isolate as the handler, and Confect's module-scope Effect runs (registration layer builds and schema-to-validator compilation) could still dispatch a yield through timer APIs there. These now run with cooperative yielding disabled.
