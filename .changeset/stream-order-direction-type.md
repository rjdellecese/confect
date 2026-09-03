---
"@confect/server": minor
---

Track a `QueryStream`'s order direction in its type. `reader.table(...).stream(...)` now returns a `QueryStream` whose fifth type parameter is `"asc"` (the default), `"desc"`, or the union when the direction is a runtime value, and every combinator preserves it. `QueryStream.merge` requires its inputs to share a direction and `QueryStream.flatMap` requires inner streams to run in the outer stream's direction, so mixing statically known directions is now a type error rather than a failure when the stream runs. The runtime check remains for directions the types can't see.

Also add `QueryStream.isQueryStream`, a type guard that tells a query stream apart from the plain `Stream` a generic `Stream.*` combinator turns it into.

The parameter is invariant, like the order-key parameter: a stream typed `"desc"` is not assignable to a `QueryStream<Doc, Key, E, R>` annotation, which defaults the direction to the union. Write the direction into such annotations, or leave the type to inference.
