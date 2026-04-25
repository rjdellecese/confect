---
"@confect/server": patch
---

Fix Confect-wrapped Convex queries so internal Effect runtime calls to `Date.now()` no longer invalidate Convex's reactive query cache. Query handlers now stub `Date.now()` by default while preserving real-time access through Effect's `Clock` service for callers that intentionally opt in.
