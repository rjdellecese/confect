---
"@confect/server": major
---

Fixed an issue where the cached value for any Confect query would be regularly busted by a hidden Effect dependency on `Date.now()`. This has been solved by stubbing `Date.now()` to always return the Unix epoch (`0`). If you previously relied on `Date.now()` in your queries, (1) try to rewrite them to avoid it (see [Convex best practices](https://docs.convex.dev/understanding/best-practices/#date-in-queries) on using dates in queries), or (2) use Effect's `Clock` service, which will still return an unstubbed timestamp.
