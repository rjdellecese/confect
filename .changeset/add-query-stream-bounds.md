---
"@confect/server": minor
---

Allow inclusive or exclusive endpoints on either side of an experimental `QueryStream.narrow` range, supporting time windows and selections that include or exclude their boundary items. Provide at least one of `start` or `end`, each containing a `key` and an `inclusive` flag; endpoints follow stream order, including on descending streams.
