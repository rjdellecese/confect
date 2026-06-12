---
"@confect/server": patch
---

Fix `GetByIndexFailure.indexFieldValues` claiming index field values are strings when they can be any Convex value.

Previously, non-string index field values (numbers, bigints, booleans, ids, etc.) were force-cast to `string[]`, so the field's type lied about its contents. `indexFieldValues` is now typed as an array of unknown values and carries the actual values used in the failed lookup. The error `message` now renders the values as JSON, handling every Convex value type including `bigint` values from `int64` index fields.
