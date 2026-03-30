---
"@confect/server": minor
---

Add optional `filter` parameter to `OrderedQuery.paginate`. This allows applying a Convex filter directly at the pagination level — the one scenario where `.filter()` is recommended over index-based filtering. The filter callback receives a `FilterBuilder` and is applied to the underlying query before paginating.
