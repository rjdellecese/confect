---
"@confect/server": patch
---

Fix a crash when `get` by index missed on an index over non-string fields.

`GetByIndexFailure` declared its `indexFieldValues` as `Schema.Array(Schema.String)` while the actual values can be any Convex value (numbers, bigints, booleans, ids, etc.). Because `Schema.TaggedError` constructors validate at runtime, a `get` by such an index would die with a `ParseError` defect whenever the lookup found no document — instead of failing with the catchable `GetByIndexFailure`. Lookups that found a document were unaffected, so the crash only surfaced on a miss.

`indexFieldValues` is now typed as an array of unknown values and carries the actual values used in the failed lookup. The error `message` renders them as JSON, handling every Convex value type including `bigint` values from `int64` index fields.
