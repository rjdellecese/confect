---
"@confect/foldkit": minor
---

Add `QueryResult` for storing reactive query state in Foldkit Models, with `Loading`, `Success`, and `Failure` variants, constructors, matching, predicates, and a `QueryResult.QueryResult` schema constructor for Model encoding and decoding. Values support piping and Effect equality and hashing, including after decoding. Subscription eligibility stays separate from the query result.
