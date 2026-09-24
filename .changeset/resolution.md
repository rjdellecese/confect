---
"@confect/cli": patch
---

Resolve external ESM dependencies from the workspace that imports them during codegen. Preserve the original package specifiers used by import-graph checks, and encode external module locations as file URLs so paths with spaces or fragment characters remain loadable.
