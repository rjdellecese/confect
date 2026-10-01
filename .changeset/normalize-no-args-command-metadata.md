---
"@confect/foldkit": patch
---

Make commands created without arguments expose `args: {}`, matching their declared type and the metadata of an explicit empty-argument call, while preserving argument omission during execution.
