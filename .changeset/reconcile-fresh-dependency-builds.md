---
"@confect/cli": patch
---

Avoid unnecessary dependency rebuilds during `confect dev` startup and declaration updates, while still reconciling source edits and queued file additions or removals before reporting readiness.
