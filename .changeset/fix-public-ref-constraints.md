---
"@confect/js": patch
---

Fix `HttpClient` to only accept public `Ref`s

`HttpClient` query, mutation, and action methods now correctly reject internal `Ref`s at the type level, matching the runtime behavior of Convex browser clients which can only call public functions.
