---
"@confect/js": patch
---

Fix `HttpClient` and `ConfectClient` to only accept public `Ref`s

Query, mutation, and action methods now correctly reject internal `Ref`s at the type level, matching the runtime behavior of Convex browser clients which can only call public functions.
