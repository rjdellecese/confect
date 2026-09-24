---
"@confect/core": patch
---

Preserve every original union member when deriving Convex validator types. Removing a broader structural member must not also remove the narrower members or their nested field paths.
