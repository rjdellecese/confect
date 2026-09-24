---
"@confect/core": patch
"@confect/cli": patch
---

Preserve Convex API paths whose group names are JavaScript keywords, such as public and protected. Validate group path segments separately from exported function names, and generate safe, distinct internal import bindings without changing the API paths. Regenerate Confect output after upgrading.
