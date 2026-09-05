---
"@confect/server": minor
---

Add `QueryStream.reverse`, which runs a composed query stream in the opposite direction. Every leaf is rebuilt with the other order, so the reversed stream reads from the index in that direction rather than collecting and reversing, and it stays a query stream: it merges and paginates like any other. The typical use is bidirectional pagination, loading a feed's earlier pages with the reverse of the stream that loads its later ones.

Merges, `filter`/`map` and their effectful forms, `flatMap`/`leftJoin` (inner streams included), `orderBy`, and `empty` all reverse. A `distinct` stream throws when reversed, because the other direction would keep a different document per group; apply `distinct` to the reversed input instead.
