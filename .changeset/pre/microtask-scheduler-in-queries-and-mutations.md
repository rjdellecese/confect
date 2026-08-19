---
"@confect/server": patch
---

Fix query and mutation handlers crashing with Convex's "Can't use setTimeout in queries and mutations" error once they performed enough Effect operations to trigger a cooperative fiber yield. Effect execution in queries and mutations now yields via the microtask queue instead of timer APIs, which Convex's isolate forbids. Actions are unchanged.
