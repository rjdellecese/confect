---
"@confect/cli": patch
---

Speed up `confect dev` after specification, table, and shared dependency edits by regenerating only affected declarations and validating their implementations. Adding or removing files, changing configuration, and recovering from generation errors still trigger a full generation.
