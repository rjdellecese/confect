# Exploration: a stream-first querying API for Confect

> Status: exploration / pre-RFC.
> Prompted by the Convex team's direction on streams — see
> [Merging Streams of Convex data](https://stack.convex.dev/merging-streams-of-convex-data),
> [Take Control of Pagination](https://stack.convex.dev/pagination), and
> [Fully Reactive Pagination](https://stack.convex.dev/fully-reactive-pagination).

## TL;DR

Make **`Stream` the query type**, not a terminal method. `reader.table("messages").index("by_creation_time")` would return a `QueryStream<Doc>` — a genuine Effect `Stream` (usable with every `Stream.*` combinator) that additionally remembers its **index ordering** and each element's **index key**. That extra structure is exactly what makes union (`merge`), join (`flatMap`), predicate filtering (`filterEffect`), loose index scans (`distinct`), and — critically — **pagination over arbitrary compositions** possible, which a plain `Stream<Doc>` can never support.

This is the Effect-native formulation of `convex-helpers/server/stream`'s `QueryStream`, and it is a place where Confect can be _better_ than the untyped original: ordering compatibility, merge keys, and distinct-field prefixes can be checked **at the type level** instead of throwing at runtime, and effectful predicates get real error (`E`) and requirements (`R`) channels instead of closed-over `ctx`.

---

## 1. Where we are today

Confect's read path is already stream-shaped underneath — it just doesn't expose it as the primary abstraction:

- `OrderedQuery` (`packages/server/src/OrderedQuery.ts:53-75`) builds one
  `Stream.fromAsyncIterable` over the Convex `OrderedQuery` async iterator, and derives
  `first`, `take`, and `collect` from it. `stream()` is offered as _one more terminal_ among
  five.
- `paginate` (`OrderedQuery.ts:77-103`) is the odd one out: it bypasses the stream entirely
  and delegates to Convex's built-in `.paginate()`, with filtering only available as a
  `paginate`-argument (`filter?: (q: FilterBuilder<…>) => …`), not as a composable
  combinator.
- There is no way to combine two queries at all: no union, no join, no interleaving. Every
  query is one index range over one table.
- Cursors are untyped `Schema.String` everywhere (`packages/core/src/PaginationResult.ts:12`).

So the question "what would a purely stream-based API look like?" is really: **what has to be
added to `Stream` so that everything — including `paginate` — can be derived from it?**

## 2. What the Convex articles establish

The three Stack posts, read together, make a precise technical argument:

1. **Pages must be range-defined, not count-defined** ([Fully Reactive Pagination]). A
   reactive page defined as "next N items after cursor C" grows gaps/overlaps as data
   changes. The fix is to pin both endpoints: a page is "all items between index key A and
   index key B", and it grows/shrinks reactively. Convex's built-in `paginate` does this via
   the internal query journal; anything _not_ built on the built-in `paginate` must do it
   itself by threading `endCursor`.

2. **`getPage` generalizes pagination to explicit index ranges** ([Take Control of
   Pagination]). Once a page is "an index range", you can start it anywhere, run it
   backwards, jump around, and stitch unions/joins — none of which the built-in
   `paginate`/`usePaginatedQuery` support.

3. **Streams are the composable packaging of that idea** ([Merging Streams]). A
   `QueryStream` is _an async iterable of documents ordered by indexed fields_. Because each
   element is annotated with its **index key**, streams can be:
   - **merged** (`mergedStream([a, b], ["_creationTime"])` — SQL `UNION ALL` with a k-way
     ordered merge),
   - **joined** (`flatMap` — each outer doc expands to an inner stream),
   - **filtered by arbitrary code** (`filterWith` — filtered-out rows still advance the
     cursor, so the result remains paginable),
   - **deduplicated** (`distinct` — a loose index scan that _skips_ the index forward), and
   - **paginated** (`paginate` — narrow the composed stream to `(cursor, endCursor]` bounds
     and consume; the continue-cursor is just the last index key seen).

The load-bearing insight is the annotation. In `convex-helpers`' internal contract
(`server/stream.ts`), every stream must implement:

```ts
abstract iterWithKeys(): AsyncIterable<[T | null, IndexKey, number]>; // doc|filtered, key, bytes
abstract narrow(indexBounds: IndexBounds): QueryStream<T>;            // push cursor bounds down
abstract getOrder(): "asc" | "desc";
abstract getIndexFields(): string[];       // reflection: what am I ordered by?
abstract getEqualityIndexFilter(): Value[]; // reflection: which key prefix is pinned?
```

Everything else — `first`, `take`, `collect`, `unique`, `paginate`, `mergedStream`,
`flatMap`, `distinct` — is derived from these five. `[Symbol.asyncIterator]` just projects
the doc and drops the keys, i.e. **a plain stream is the forgetful image of a query
stream.**

## 3. Prior art in typed FP

This shape is well-trodden in the typed FP world, which is reassuring:

- **doobie / fs2 (Scala)**: `sql"select …".query[A].stream` gives a cursor-backed
  `Stream[ConnectionIO, A]` — lazy, chunked, constant-memory, resource-safe. The "query
  result is fundamentally a stream; `.to[List]` is just one sink" framing is exactly the
  inversion proposed here.
- **fs2 `interleaveOrdered` / ZIO `ZStream` sorted merges / Effect's own
  `Stream.zipAllSortedByKey*`**: ordered k-way merging of already-sorted streams is a
  standard combinator family; `mergedStream` is this pattern specialized to index-key order.
- **Effect `Stream.paginateChunkEffect(s, f)`**: pagination _as unfold_ — state `S` is the
  cursor, each step effectfully yields a chunk plus `Option<S>`. Convex pagination fits this
  signature perfectly (`S = continueCursor`), and it's how "give me _all_ pages as one
  stream" should be spelled on the client/action side.
- The general lesson from these libraries: **keep the metadata in the type, degrade to the
  plain stream explicitly**. fs2's `Stream` doesn't know it's sorted; libraries that need
  sortedness either take it on faith (runtime contract, like `convex-helpers`) or wrap the
  stream in a witness type. Confect, with a fully typed schema in hand, can do the witness
  properly.

## 4. The proposed shape

### 4.1 `QueryStream` — a `Stream` that remembers its order

```ts
// @confect/server/QueryStream (sketch)

interface QueryStream<
  out Doc,
  out Key extends ReadonlyArray<string> = ReadonlyArray<string>, // remaining (un-pinned) index fields
  out E = never,
  out R = never,
> extends Stream.Stream<Doc, E, R> {
  readonly [TypeId]: {
    readonly _Key: Types.Covariant<Key>;
  };
}
```

- It **is** a `Stream` (implementable via `effect/Streamable.Class`, or a `Pipeable` data
  type with a `Stream` variance struct): `Stream.take`, `Stream.runCollect`,
  `Stream.mapEffect`, `Stream.zip` … all just work. Consuming it as a `Stream` yields
  decoded documents in index order.
- `Key` is the **type-level ordering witness**: the index fields that still vary, i.e. the
  index's fields minus the equality-pinned prefix, plus the `_creationTime`/`_id`
  tiebreakers. It's what `merge`/`distinct`/`flatMap` check against.
- Internally it carries what the Stream interface can't express (mirroring
  `convex-helpers`, but in Effect vocabulary):

```ts
// internal
readonly annotated: Stream.Stream<readonly [Option.Option<Doc>, IndexKey], E, R>;
//                                          ^ None = read-but-filtered-out: advances cursors
readonly order: "asc" | "desc";
readonly indexFields: ReadonlyArray<string>;
readonly equalityPrefix: ReadonlyArray<Value>;
readonly narrow: (bounds: IndexBounds) => QueryStream<Doc, Key, E, R>;
```

Applying a generic `Stream` combinator degrades a `QueryStream` to a plain `Stream`
(metadata gone, pagination gone) — which is correct and honest: `Stream.filter` genuinely
destroys paginate-ability (dropped rows no longer advance cursors), while
`QueryStream.filterEffect` preserves it. The type system now _explains_ the difference
instead of the library hiding it.

### 4.2 Constructing: `index()` returns the stream

The `DatabaseReader` surface barely changes — `index()` simply _is_ the query now:

```ts
const reader = yield * DatabaseReader;

// QueryStream<Doc<"messages">, ["_creationTime", "_id"]>
const aToB = reader
  .table("messages")
  .index("from_to", (q) => q.eq("from", a).eq("to", b));

// consume it like any Stream — no more bespoke terminals
const first10 = yield * aToB.pipe(Stream.take(10), Stream.runCollect);
```

Note the `Key`: `from_to` is `["from", "to", "_creationTime", "_id"]`, and both `from` and
`to` are equality-pinned, so the remaining ordering is `["_creationTime", "_id"]`. Today the
range callback returns Convex's opaque `IndexRange`, so the pinned prefix is only knowable
at runtime; a Confect-typed range builder (a thin wrapper over Convex's — which already
threads the field position through its types) would return `IndexRange<RemainingKey>` and
make the `Key` inference exact. This is the first concrete win over `convex-helpers`, where
merge-key compatibility is a runtime `throw`.

`get` stays an `Effect` (a lookup is not a stream), and `search` stays separate (relevance
order has no index key — see §6.3).

### 4.3 Combining: the `QueryStream.*` combinators

All dual (data-first/data-last), all pipeable, mirroring `Stream`'s own style:

```ts
// UNION ALL: k-way ordered merge. Type error unless every input's Key matches `by`.
const conversation: QueryStream<
  Doc<"messages">,
  ["_creationTime", "_id"]
> = QueryStream.merge([aToB, bToA], { by: ["_creationTime"], order: "desc" });

// JOIN: for each friend, stream their messages; result ordered by (outer, inner) keys.
const feed = friends.pipe(
  QueryStream.flatMap(
    (friend) =>
      reader
        .table("messages")
        .index("from_to", (q) => q.eq("from", friend.friendId)),
    { key: ["to", "_creationTime", "_id"] }, // inferable from the inner stream's type
  ),
);

// WHERE with arbitrary Effect code — E and R flow into the stream's channels.
const visible = conversation.pipe(
  QueryStream.filterEffect((message) =>
    reader
      .table("users")
      .get(message.from)
      .pipe(Effect.map((author) => !author.banned)),
  ),
);
// : QueryStream<Doc<"messages">, ["_creationTime", "_id"], DocumentDecodeError | GetByIdFailure>

// SELECT: map preserves index keys, so the result is still paginable.
const projected = visible.pipe(QueryStream.mapEffect((m) => decorate(m)));

// DISTINCT / loose index scan: fields must be a prefix of Key — checked in types.
const recipients = reader
  .table("messages")
  .index("from_to", (q) => q.eq("from", me))
  .pipe(QueryStream.distinct(["to"]));
```

Compare `filterEffect` with the `convex-helpers` original, where the predicate is
`(doc) => Promise<boolean>` closing over `ctx`: here the predicate is an `Effect`, so it can
use the `DatabaseReader` (or any service), its failures are typed and surface in the
stream's `E`, it's interruptible, and it's testable with the same Layer machinery as
everything else in Confect.

### 4.4 Consuming: `Stream` sinks, plus two query-specific ones

```ts
// Plain Stream consumption (order preserved, cursors irrelevant):
yield * Stream.runCollect(conversation);
yield * Stream.runHead(conversation); // ≈ first()
yield * conversation.pipe(Stream.take(5), Stream.runCollect);

// Query-specific terminals that need the annotations:
yield * QueryStream.unique(aToB); // Effect<Option<Doc>, … | NotUniqueError>
yield * QueryStream.paginate(conversation, paginationOpts);
// : Effect<PaginationResult<Doc>, DocumentDecodeError | E, R>
```

`first`/`take`/`collect` stop being bespoke methods — they were already implemented as
Stream sinks internally (`OrderedQuery.ts:63-75`); the API finally admits it. Whether to
keep them as convenience re-exports on `QueryStream` is a bikeshed; the important part is
they're derived, not primitive.

### 4.5 Pagination as a stream sink

`QueryStream.paginate` is the port of `convex-helpers`' `QueryStream.paginate`
(`stream.ts:349-450`), now expressible because the stream kept its annotations:

1. deserialize `cursor`/`endCursor` into `IndexKey`s,
2. `narrow` the composed stream to those bounds (each layer pushes bounds down —
   `MergedStream.narrow` narrows every branch, `FlatMapStream` narrows outer+inner, the leaf
   turns bounds into real `withIndex` ranges via split-range reflection),
3. consume the annotated stream, counting _read_ rows (including filtered-out `None`s)
   against `maximumRowsRead`/`maximumBytesRead`,
4. the continue-cursor is the serialized last index key; `pageStatus`/`splitCursor` fall out
   of the same accounting.

Two pieces of existing Confect infrastructure line up almost eerily well:

- `PaginationOptions` (`packages/core/src/PaginationOptions.ts`) already declares
  `endCursor`, `maximumRowsRead`, and `maximumBytesRead` — the exact protocol fields
  stream-pagination needs. Nothing changes on the wire, and `FunctionSpec.publicPaginatedQuery`
  handlers keep their shape:

```ts
FunctionSpec.publicPaginatedQuery({
  args: () => Schema.Struct({ otherUser: Ref.Id("users") }),
  item: () => Message,
});

// impl
({ otherUser, paginationOpts }) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const me = yield* currentUserId;
    const sent = reader
      .table("messages")
      .index("from_to", (q) => q.eq("from", me).eq("to", otherUser), "desc");
    const received = reader
      .table("messages")
      .index("from_to", (q) => q.eq("from", otherUser).eq("to", me), "desc");
    return yield* QueryStream.paginate(
      QueryStream.merge([sent, received], { by: ["_creationTime"] }),
      paginationOpts,
    );
  });
```

- The one thing that must change alongside: **`@confect/react`'s `usePaginatedQuery`**.
  Today it rides `convex/react`'s internal hook, whose gap-free reactivity depends on the
  query journal that only the built-in `db.paginate` writes. Stream pagination doesn't
  touch the journal, so the client must pin pages itself by echoing each page's
  `continueCursor` back as the next request's `endCursor` — precisely what
  `convex-helpers/react`'s `usePaginatedQuery` does. Since Confect already owns its hook
  wrapper and already decodes/encodes the protocol fields, adopting the endCursor-pinning
  strategy is contained in `@confect/react` (likely by vendoring/adapting the helper hook
  rather than reaching into more `convex/react` internals). Same trick, one layer down: the
  _hook_ re-issues range-pinned queries; the semantics the articles demand are preserved.

### 4.6 Client-side streams, for completeness

A purely stream-based story doesn't stop at the function boundary:

- `@confect/js`'s `WebSocketClient.reactiveQuery` already returns
  `Stream<Returns, …>` — the subscription side is done.
- A natural addition: `Stream.paginateChunkEffect` over a paginated query ref, giving
  clients/actions "all pages as one `Stream<Item>`" with the cursor as internal unfold
  state:

```ts
const allMessages: Stream.Stream<Message, …> = client.paginatedQueryStream(
  api.messages.list,
  { otherUser },
  { pageSize: 100 },
);
```

(One-shot, non-reactive — the reactive UI path remains `usePaginatedQuery`.)

## 5. Why this is better in Effect than in vanilla TS

| Concern                                | `convex-helpers/server/stream`                 | Effect-native `QueryStream`                                                                                                |
| -------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Merge-key compatibility                | runtime `throw` ("Consider using .orderBy")    | type error at `merge` call site                                                                                            |
| `distinct`/`flatMap` field constraints | runtime validation                             | type-level prefix/key checks against the schema's index tuples                                                             |
| Filter predicates                      | `(doc) => Promise<boolean>` closing over `ctx` | `(doc) => Effect<boolean, E2, R2>` — typed errors, DI via `R`, interruptible                                               |
| Error handling                         | thrown exceptions                              | `E` channel: `DocumentDecodeError \| NotUniqueError \| user errors`, matchable                                             |
| Document validation                    | none (raw docs)                                | per-element `Schema` decode, exactly as today                                                                              |
| Early termination                      | `break` in a `for await`                       | `Stream.take`/interruption, resource-safe by construction                                                                  |
| Ecosystem                              | bespoke methods                                | the whole `Stream` toolbox (`throttle`, `zip`, `grouped`, `changes`, …) for free once you (explicitly) leave paginate-land |
| Cursors                                | `string`                                       | branded `Cursor` (still a string on the wire), decoded/validated at the edge                                               |

And one thing to keep from `convex-helpers` verbatim: the cursor accounting trick of
streaming `[Option<Doc>, IndexKey]` rather than `Doc` — it's the difference between "a
stream you can look at" and "a stream you can resume".

## 6. Design questions worth settling early

### 6.1 Subtype of `Stream`, or separate type with `.stream`?

Recommendation: **subtype** (that's what "purely stream-based" means). The cost is that
generic `Stream` combinators silently degrade the type from `QueryStream` to `Stream` —
but that degradation is semantically real (see §4.1), and TypeScript handles it gracefully:
you keep a `Stream<Doc, E, R>`, you've lost `QueryStream.paginate`. The alternative (a
builder with a `.stream()` escape hatch) is what we have today, and it's exactly the
"stream as afterthought" shape being replaced.

### 6.2 Wrap `convex-helpers`, or port it?

- **Wrapping** gets battle-tested `narrow`/split-range/merge logic for free and tracks
  upstream fixes, but impedance-mismatches on every combinator that takes user code: their
  `filterWith`/`flatMap` take `Promise`-returning functions, so every Effect predicate needs
  a `Runtime` capture to run inside their iterator, and `R` threading gets awkward.
- **Porting** (the annotated-stream core, `ReflectIndexRange`, `splitRange`, k-way merge,
  distinct-skip) is a bounded amount of code (~the interesting half of a 2k-line file, with
  the reflection machinery mostly mechanical), keeps `E`/`R` first-class, and lets the merge
  be a proper `Channel`-level ordered merge.

Recommendation: **port the core, steal the tests**. Keep cursor _wire format_
compatibility a non-goal (Confect cursors never met `convex-helpers` cursors), but keep the
same serialization approach (JSON of `convexToJson`'d index keys), and inherit their
documented caveats (index keys — including filtered-out rows' keys — are visible in
cursors; treat cursors as sensitive if index fields are).

### 6.3 What about `search()` and vector search?

Search results are relevance-ordered: there is no index key, hence no `narrow`, no merge,
no stream pagination. `search()` should return a plain `Stream<Doc, DocumentDecodeError>`
(possibly with Convex-native `paginate` kept as an `Effect`-returning sibling), and the
types will correctly refuse to `merge` it with index streams. Vector search stays as-is.

### 6.4 Laziness and reuse

Today `streamEncoded` is built once per `OrderedQuery.make` and re-consuming it relies on
Convex's iterable semantics. A `QueryStream` should be a _description_ (like every Stream):
each run re-executes the underlying Convex query. That also matters for `paginate`, which
runs the stream through `narrow` — i.e. never consumes the un-narrowed iterator at all.

### 6.5 Migration and versioning

This is a breaking change to the read API (terminals move off the query object), so it's
naturally a major — and the Effect v4 line (`v10` branch) is the obvious vehicle, since the
read API is being touched there anyway. A staging option that keeps `main` shippable:

1. Additive: introduce `QueryStream` + combinators; `index()` keeps returning
   `OrderedQuery`, which gains `asQueryStream()` (or `QueryStream.fromOrderedQuery`).
2. v10: `index()` returns `QueryStream` directly; `first`/`take`/`collect`/`paginate`
   terminals are removed in favor of `Stream` sinks + `QueryStream.paginate`;
   `paginate`'s `filter` argument is removed in favor of `QueryStream.filterEffect`;
   `@confect/react`'s `usePaginatedQuery` switches to endCursor-pinned pages.

Docs impact is contained: `apps/docs/server/database/reading.mdx` becomes a streams page
(the current "Methods" section becomes "Consuming a stream"), plus a new "Combining
queries" page for merge/flatMap/filter/distinct — which is a genuinely new capability
Confect simply doesn't have a page for today, because it doesn't have the feature.

## 7. Prototype (implemented on this branch)

The core of §4 is now implemented as a working prototype:

- **`packages/server/src/QueryStream.ts`** — the `QueryStream` class (a genuine
  `Stream` via the `Streamable` protocol, implemented directly because
  `Streamable.Class`'s declaration types the variance struct as `never`s, which
  breaks `Stream.*` type inference), the typed range builder with type-level
  `eq`-prefix consumption, Convex value ordering, and the combinators/sinks:
  `merge` (k-way ordered, `Key`-invariant so mismatches are type errors),
  `filterEffect`, `mapEffect`, `narrow`, `unique`, and `paginate` with
  `cursor`/`endCursor`/`maximumRowsRead` semantics matching `convex-helpers`.
  Leaf streams store a **`Reflection`** — the query recipe (reader handle,
  table, index, recorded range ops, order, effective bounds), the Effect
  formulation of `convex-helpers`' `reflect()` — and rebuild the (one-shot)
  Convex queries from it on every run, so a `QueryStream` value is a
  reusable description.
- **Push-down `narrow`** — cursor bounds are pushed into the database
  queries rather than filtered in memory. Bounds are modelled as _cuts_
  (predecessor/exact/successor positions over possibly-prefix keys, the
  port of `convex-helpers`' `compareKeys`); `eq`-pinned values fold into
  full-index-key bounds and `splitRange` re-derives them as the common
  `eq` prefix while decomposing the rest into a sequence of
  Convex-expressible `withIndex` ranges (`_creationTime` and `_id`
  tiebreaker constraints included — Convex accepts them even though its
  types don't advertise them). Each stream carries a `narrowWith`
  strategy: leaves rebuild with intersected bounds, `merge` narrows every
  branch, `filterEffect`/`mapEffect` narrow beneath themselves and
  re-apply, and externally constructed streams fall back to in-memory
  filtering. `paginate` composes with this automatically, so resuming from
  a cursor reads only the remaining range.
- **`flatMap`** — the join: each outer document expands into an inner
  stream, ordered by (outer key, then inner key), with the concatenated
  order key tracked _at the type level_ (`readonly [...OuterKey,
...InnerKey]`) and the `innerKey` argument checked against `f`'s return
  type. Outer documents that contribute no inner elements (filtered out,
  or an empty inner stream) emit a `null`-padded filtered element so
  cursors advance past their cost. Narrowing splits bounds at the
  outer/inner seam; the inner bound applies only to the _boundary_ outer
  row — a deliberate correctness deviation from `convex-helpers`, whose
  `FlatMapStream.narrow` applies inner bounds to every row's inner stream
  and so drops legitimate elements from non-boundary rows when resuming
  from a mid-row cursor.
- **`distinct`** — the loose index scan: the first document per distinct
  value of a _prefix_ of the order key, one index seek per group (each
  group's first present document narrows the underlying stream past the
  whole group via a prefix-successor cut). The prefix requirement is a
  type-level constraint (`Key` must extend `readonly [...Fields,
...rest]`); narrowing truncates bound keys to the distinct prefix, as in
  `convex-helpers`.
- **`orderBy`** — re-keying: a position-for-position relabeling of the
  order key (tuple-length-checked at the type level) that makes streams
  from different indexes or tables mergeable when their keys align
  positionally. Because order keys and bounds are pure _values_, the
  relabeling is transparent to narrowing — bounds pass straight through to
  the underlying stream, with none of the static-prefix bookkeeping
  `convex-helpers`' `OrderByStream` needs (its other job, dropping
  equality-pinned prefix fields, is already the leaf's remaining-field key
  convention here).
- **`useStreamPaginatedQuery`** (`@confect/react`) — the client half of
  §4.5: endCursor-pinned reactive pagination, built as a pure
  `StreamPagination` state machine (pages, ongoing splits, load-more and
  split transitions, and a per-render interpretation of the subscribed
  pages' results) driven by a thin hook over `convex/react`'s
  `useQueries`. Each loaded page re-subscribes with its `continueCursor`
  echoed back as `endCursor`, so pages grow and shrink reactively but
  always meet exactly; overgrown pages split (the server's `paginate` now
  emits `SplitRecommended` with a midpoint `splitCursor` when a pinned
  page outgrows its requested size); invalid cursors reset pagination.
  Args, items, and typed errors flow through the ref's schemas into the
  same `PaginatedQueryResult` ADT as `usePaginatedQuery`.
- **`QueryInitializer.stream(...)`** — `reader.table("notes").stream("by_text",
(q) => q.eq("text", "a"), "desc")` returns
  `QueryStream<Doc, ["_creationTime"], DocumentDecodeError>`.
- **`packages/server/test/mock-backend/queryStream.test.ts`** — runtime tests
  (ordering, plain `Stream` consumption, range bounds, merge interleaving,
  effectful filtering, cursor-chained pagination over a merged+filtered
  stream, endCursor pinning, `SplitRequired`, `unique`, pushed-down leaf
  bounds, pagination through duplicate index values and descending streams,
  cursor/spec-bound composition) and type-level tests (order-key inference,
  merge mismatch rejection, range-builder misuse, `E`/`R` channel
  propagation).

Deliberate prototype simplifications, in line with §6.2's "port the core"
recommendation:

- Cursors serialize only the _remaining_ (order-key) fields — a deliberate
  improvement over `convex-helpers`' full index keys: equality-pinned values
  never leak into cursors, and merged streams with different pins share a
  cursor space by construction.
- No `orderBy` (re-keying) yet; no `maximumBytesRead` accounting; NaN
  ordering subtleties are skipped.

## 8. Open questions

1. **Key inference ergonomics** — how far to push the typed range builder. Full inference
   of the eq-pinned prefix (so `Key` is exact) vs. a simpler declared-`by` at merge sites
   with runtime validation as backstop. Prototype the former; it's the marquee type-safety
   win, and Convex's own `IndexRangeBuilder` types already thread field positions.
2. **`orderBy` re-keying** — `convex-helpers` lets you re-designate index fields
   (`.orderBy(...)`) to make heterogeneous streams mergeable (e.g. two tables that both end
   in `["_creationTime", "_id"]` but with different-named prefixes). Same-named fields
   across tables is a real restriction in practice; decide whether `merge`'s `by` matches
   _positions_ (suffix of the key) rather than _names_ to sidestep it.
3. **Reactivity guarantees** — document precisely which client patterns are gap-free
   (endCursor-pinned `usePaginatedQuery`) vs. eventually-consistent-ish (manual
   `loadMore` without pinning), mirroring the caveats in the Merging Streams article.
4. **Bandwidth accounting** — whether to surface `maximumBytesRead`-style limits on
   non-paginate sinks too (e.g. a `QueryStream.collectWithBudget`), since `filterEffect`
   makes it easy to read a lot while emitting a little.
5. **`Chunk`ing** — Convex iterators yield one doc at a time; whether to re-chunk
   internally (and batch-decode via `Stream.mapChunksEffect`) for constant-factor wins.

## Appendix: the annotated-element trick, in one picture

```
QueryStream<Doc, Key, E, R>
│
│  annotated: Stream<[Option<Doc>, IndexKey], E, R>   ← resumable: every element knows where it is
│  order, indexFields, equalityPrefix                 ← mergeable: compatibility is checkable
│  narrow(bounds)                                     ← paginable: cursors become index ranges
│
└─ forget the annotations ────────────────► Stream<Doc, E, R>   ← consumable: the whole Stream toolbox
```

`merge` / `flatMap` / `filterEffect` / `distinct` / `mapEffect` operate on the annotated
level and return `QueryStream`; `paginate` / `unique` are sinks on the annotated level;
everything else is ordinary `Stream` code.
