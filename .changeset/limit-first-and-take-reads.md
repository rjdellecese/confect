---
"@confect/server": patch
---

Back Confect's `first()` and `take(n)` with native Convex `take()` calls rather than consuming the query's `AsyncIterable`. Convex can prefetch a full index page behind the iterator even when only a few documents are requested; native `take()` communicates the limit to the backend and avoids that unnecessary prefetching.

Fix `take(n)` to use Convex's non-negative-integer validation: fractional, negative, `NaN`, and infinite counts now fail instead of being rounded, returning no documents, or collecting the entire query. `collect()` continues to read all results.
