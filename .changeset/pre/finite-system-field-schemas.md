---
"@confect/core": patch
"@confect/server": patch
---

The schemas Confect uses for values Convex itself produces now reject `NaN` and `±Infinity`: `_creationTime`, a scheduled function's `scheduledTime` and `completedTime`, a stored file's `size`, and the fields of `PaginationOptions`. Convex cannot return a non-finite value for any of them, so this rules out states that were never reachable.

The Convex validators these compile to are unchanged — each is still `v.float64()` — so nothing changes about what your deployment accepts. Only Confect's decoding is narrower. Your own table schemas are untouched: `Schema.Number` still accepts non-finite values wherever you use it, which matters because Convex stores them.
