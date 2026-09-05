---
"@confect/server": patch
---

`QueryStream.paginate` now resumes from a cursor by reading only the remaining index range instead of re-reading the stream from the start. The cursor bounds are pushed down into the underlying index queries, including through `QueryStream.merge`, `QueryStream.filterEffect`, and `QueryStream.mapEffect` compositions, so later pages cost roughly one page of reads rather than all preceding pages.
