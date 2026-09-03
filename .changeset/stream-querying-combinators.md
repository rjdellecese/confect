---
"@confect/server": minor
---

Add three combinators to `QueryStream`:

- `QueryStream.flatMap` joins each document to an inner stream (e.g. each author to their messages), concatenating the order keys in the type system so the joined stream stays mergeable and paginable.
- `QueryStream.distinct` emits the first document of each group of consecutive equal order-key prefixes, reading via a loose index scan (one indexed read per group) rather than scanning every row. The requested prefix must be a prefix of the stream's order key, enforced at the type level.
- `QueryStream.orderBy` relabels a stream's order key positionally, so streams from different indexes or tables whose keys share value order but not field names can be merged. A `flatMap` result cannot be relabeled; relabel its inputs before joining.
