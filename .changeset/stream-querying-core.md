---
"@confect/server": minor
---

Add `QueryStream`, a stream-first querying prototype. `reader.table(...).stream(index, range?, order?)` returns a genuine Effect `Stream` of documents in index order that stays combinable and paginable: `QueryStream.merge` interleaves streams that share an order key, `QueryStream.filterEffect` and `QueryStream.mapEffect` transform documents without losing pagination support, `QueryStream.unique` expects at most one result, and `QueryStream.paginate` turns any composed stream into a paginated query page.

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
    QueryStream.filterEffect((event) => Effect.succeed(!event.cancelled)),
    QueryStream.paginate(paginationOpts),
  );
```
