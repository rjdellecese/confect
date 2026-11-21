---
"@confect/server": patch
---

Reject incompatible table handles at compile time when wrapping a typed Convex database reader or writer. Handles can still transform values as long as their encoded fields match the native model for the operation.
