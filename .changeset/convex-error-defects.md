---
"@confect/server": patch
---

A `ConvexError` thrown inside a handler's `Effect` (as an exception, rather than placed in the error channel as a typed failure) now reaches the client with its `data` intact, as it does in a plain Convex function. Previously it was delivered as a generic server error.
