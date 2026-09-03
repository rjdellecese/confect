---
"@confect/foldkit": minor
---

`PaginatedQuery.next` now pins the page it leaves to the range it displayed, so `PaginatedQuery.prev` reloads exactly that range — from the page's cursor to its continuation cursor — rather than the first `initialNumItems` documents after its cursor. Going back and forward no longer skips or repeats documents when the data has changed in between.

This also makes the machine work with paginated queries built on `QueryStream.paginate`, which have no query journal to remember page ranges.
