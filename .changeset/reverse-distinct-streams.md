---
"@confect/server": minor
---

Support `QueryStream.reverse` on distinct streams while preserving their original representatives, and fix full-key pagination bounds that could skip representatives in merged streams.

Count all underlying query-stream reads toward pagination budgets. `QueryStream.paginate` now fails with `ReadBudgetExceededError` when a budget prevents safe pagination progress or splitting, rather than returning an unusable continuation.
