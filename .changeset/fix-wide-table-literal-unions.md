---
"@confect/core": patch
---

Fix excessively deep TypeScript instantiation errors when indexing tables with wide literal-union fields using `Table.make(...).index(...)`.
