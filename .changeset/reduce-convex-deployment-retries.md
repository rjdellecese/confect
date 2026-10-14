---
"@confect/cli": patch
---

Reduce redundant Convex deployment retries after ordinary `confect dev` updates while preserving notifications needed for startup and error recovery. Explicit `confect codegen` still notifies Convex even when generated contents are unchanged.
