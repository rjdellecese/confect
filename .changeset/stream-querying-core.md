---
"@confect/server": minor
---

Add `QueryStream`, an experimental stream-first querying API. `reader.table(...).stream(index, range?, order?)` returns a genuine Effect `Stream` of documents in index order that stays combinable and paginable: `QueryStream.merge` interleaves streams that share an order key, `QueryStream.filter` and `QueryStream.map` (and their effectful counterparts `filterEffect` and `mapEffect`) transform documents without losing pagination support, `QueryStream.unique` expects at most one result, and `QueryStream.paginate` turns any composed stream into a paginated query page.

The order key is tracked in the type system: fields pinned with `.eq(...)` in the range builder are consumed from the key, and merging streams whose remaining keys differ is a type error.

```ts
import { QueryStream } from "@confect/server";

const inRange = (from: number, to: number) =>
  reader
    .table("events")
    .stream(
      "from_to",
      (q) => q.eq("kind", "meeting").gte("start", from).lt("start", to),
      "desc",
    );

const page =
  yield *
  QueryStream.merge([inRange(0, 10), inRange(20, 30)]).pipe(
    QueryStream.filter((event) => !event.cancelled),
    QueryStream.paginate(paginationOpts),
  );
```

`QueryStream.paginate` accepts the same `paginationOpts` as the built-in `paginate`. A cursor that is malformed, or that was issued under a different order key (for example after an index change is deployed), fails the query with a `ConvexError` whose data is `{ paginationError: "InvalidCursor" }` — the signal Confect's React hooks treat as "restart pagination". Stream cursors contain the order-key values of the page boundary rather than an opaque token, so don't paginate publicly over a sensitive indexed field without pinning it with `eq`.

Streams passed to `QueryStream.merge` must share an order direction as well as an order key. The direction is part of a stream's type (`"asc"` unless `stream` is given `"desc"`), so a mismatch between statically known directions is a type error; one involving a direction chosen at runtime fails when the stream runs.
