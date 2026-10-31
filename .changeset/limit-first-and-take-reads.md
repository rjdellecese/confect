---
"@confect/server": patch
---

Read only the requested documents in `first` and `take(n)`, instead of a full page of documents per call.

Fix `take(n)` to use Convex's count validation: fractional, negative, `NaN`, and infinite counts now fail instead of being rounded, returning no documents, or collecting the entire query. Use a non-negative integer count, or `collect()` to read all results.
