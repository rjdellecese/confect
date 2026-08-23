/**
 * PROTOTYPE — a stream-first querying API for Confect.
 *
 * A `QueryStream` is a genuine Effect `Stream` of decoded documents, ordered
 * by indexed fields, that additionally remembers:
 *
 * - its **order key** at the type level (the index fields that still vary
 *   after equality pinning), so that `merge` can reject incompatible streams
 *   at compile time, and
 * - each element's **order key values** at runtime (including read-but-
 *   filtered-out elements), so that `paginate` works over arbitrary
 *   compositions of `merge`/`filterEffect`/`mapEffect`.
 *
 * This is the Effect-native formulation of `convex-helpers/server/stream`'s
 * `QueryStream`; see `notes/stream-based-querying.md` for the design.
 *
 * Prototype limitations (all called out in the design doc):
 *
 * - `narrow` filters the annotated stream in memory rather than pushing
 *   bounds down into `withIndex` ranges (`splitRange` in `convex-helpers`),
 *   so resuming from a cursor re-reads the range from its start.
 * - No `flatMap` (join) or `distinct` (loose index scan) yet.
 * - Cursors serialize only the *remaining* (order-key) fields, not the full
 *   index key — equality-pinned values never leak into cursors.
 */
import type { GenericDocument, FieldTypeFromFieldPath } from "convex/server";
import { convexToJson, jsonToConvex, type Value } from "convex/values";
import { identity, dual } from "effect/Function";
import { pipeArguments, type Pipeable } from "effect/Pipeable";
import * as Chunk from "effect/Chunk";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type * as Types from "effect/Types";
import * as Document from "./Document";

export const TypeId = "@confect/server/QueryStream";
export type TypeId = typeof TypeId;

// -----------------------------------------------------------------------------
// Order keys
// -----------------------------------------------------------------------------

/**
 * The values of a document's order-key fields: the index fields that still
 * vary after equality pinning, plus the trailing `_id` tiebreaker. `undefined`
 * appears for optional fields that are absent.
 */
export type OrderKey = ReadonlyArray<Value | undefined>;

/**
 * An element of the annotated stream: the decoded document (`None` when the
 * element was read but filtered out — it still advances cursors) paired with
 * its order key.
 */
export type Element<Doc> = readonly [Option.Option<Doc>, OrderKey];

// -----------------------------------------------------------------------------
// Typed index ranges
// -----------------------------------------------------------------------------
//
// The range builder mirrors Convex's `IndexRangeBuilder`, but *consumes* the
// index-field tuple at the type level as `eq` pins fields. The remaining
// tuple becomes the resulting stream's order key, which is what `merge`
// checks for compatibility.

export const RangeSpecTypeId = "@confect/server/QueryStream/IndexRangeSpec";
export type RangeSpecTypeId = typeof RangeSpecTypeId;

export type RangeOp = {
  readonly _tag: "eq" | "gt" | "gte" | "lt" | "lte";
  readonly field: string;
  readonly value: Value | undefined;
};

/**
 * The result of applying a range callback: the recorded operations, plus a
 * phantom `Remaining` — the index fields not consumed by `eq` pinning.
 */
export interface IndexRangeSpec<out Fields extends ReadonlyArray<string>> {
  readonly [RangeSpecTypeId]: {
    readonly _Remaining: Types.Covariant<Fields>;
  };
  readonly eqCount: number;
  readonly ops: ReadonlyArray<RangeOp>;
}

export type AnyIndexRangeSpec = IndexRangeSpec<ReadonlyArray<string>>;

export type Remaining<Spec> = Spec extends IndexRangeSpec<infer R> ? R : never;

type Head<Fields extends ReadonlyArray<string>> = Fields extends readonly [
  infer H extends string,
  ...ReadonlyArray<string>,
]
  ? H
  : never;

type Tail<Fields extends ReadonlyArray<string>> = Fields extends readonly [
  string,
  ...infer Rest extends ReadonlyArray<string>,
]
  ? Rest
  : ReadonlyArray<string>;

/**
 * A typed index-range builder. `eq` must target the next unpinned index
 * field, and consumes it; `gt`/`gte`/`lt`/`lte` bound the next field without
 * consuming it (bounded fields still vary within the range).
 */
export interface RangeBuilder<
  ConvexDoc extends GenericDocument,
  Fields extends ReadonlyArray<string>,
> extends IndexRangeSpec<Fields> {
  readonly eq: (
    field: Head<Fields>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<Fields>>,
  ) => RangeBuilder<ConvexDoc, Tail<Fields>>;
  readonly gt: (
    field: Head<Fields>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<Fields>>,
  ) => LowerBoundedRange<ConvexDoc, Fields>;
  readonly gte: (
    field: Head<Fields>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<Fields>>,
  ) => LowerBoundedRange<ConvexDoc, Fields>;
  readonly lt: (
    field: Head<Fields>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<Fields>>,
  ) => IndexRangeSpec<Fields>;
  readonly lte: (
    field: Head<Fields>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<Fields>>,
  ) => IndexRangeSpec<Fields>;
}

/** After `gt`/`gte`, only an upper bound on the same field may follow. */
export interface LowerBoundedRange<
  ConvexDoc extends GenericDocument,
  Fields extends ReadonlyArray<string>,
> extends IndexRangeSpec<Fields> {
  readonly lt: (
    field: Head<Fields>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<Fields>>,
  ) => IndexRangeSpec<Fields>;
  readonly lte: (
    field: Head<Fields>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<Fields>>,
  ) => IndexRangeSpec<Fields>;
}

const makeRangeBuilder = (
  eqCount: number,
  ops: ReadonlyArray<RangeOp>,
): RangeBuilder<GenericDocument, ReadonlyArray<string>> => {
  const push =
    (tag: RangeOp["_tag"], nextEqCount: number) =>
    (field: string, value: Value | undefined) =>
      makeRangeBuilder(nextEqCount, [...ops, { _tag: tag, field, value }]);

  return {
    [RangeSpecTypeId]: {
      _Remaining: identity as Types.Covariant<ReadonlyArray<string>>,
    },
    eqCount,
    ops,
    eq: push("eq", eqCount + 1),
    gt: push("gt", eqCount),
    gte: push("gte", eqCount),
    lt: push("lt", eqCount),
    lte: push("lte", eqCount),
  };
};

/** The initial builder handed to a range callback. */
export const rangeBuilder = <
  ConvexDoc extends GenericDocument,
  Fields extends ReadonlyArray<string>,
>(): RangeBuilder<ConvexDoc, Fields> =>
  makeRangeBuilder(0, []) as unknown as RangeBuilder<ConvexDoc, Fields>;

/** Replay a recorded range spec onto Convex's real `IndexRangeBuilder`. */
export const applyRange = (spec: AnyIndexRangeSpec, q: any): any =>
  spec.ops.reduce((builder, op) => builder[op._tag](op.field, op.value), q);

// -----------------------------------------------------------------------------
// Convex value ordering
// -----------------------------------------------------------------------------
//
// Convex orders values first by type, then within the type:
// undefined < null < bigint < number < boolean < string < bytes < array
// < object. (NaN subtleties are simplified in this prototype.)

const typeRank = (v: Value | undefined): number =>
  v === undefined
    ? 0
    : v === null
      ? 1
      : typeof v === "bigint"
        ? 2
        : typeof v === "number"
          ? 3
          : typeof v === "boolean"
            ? 4
            : typeof v === "string"
              ? 5
              : v instanceof ArrayBuffer
                ? 6
                : Array.isArray(v)
                  ? 7
                  : 8;

export const compareValues = (
  a: Value | undefined,
  b: Value | undefined,
): number => {
  const rankA = typeRank(a);
  const rankB = typeRank(b);
  if (rankA !== rankB) {
    return rankA < rankB ? -1 : 1;
  }
  switch (rankA) {
    case 0:
    case 1:
      return 0;
    case 2:
    case 3: {
      const numA = a as number | bigint;
      const numB = b as number | bigint;
      return numA < numB ? -1 : numA > numB ? 1 : 0;
    }
    case 4:
      return a === b ? 0 : a === false ? -1 : 1;
    case 5: {
      const strA = a as string;
      const strB = b as string;
      return strA < strB ? -1 : strA > strB ? 1 : 0;
    }
    case 6: {
      const bytesA = new Uint8Array(a as ArrayBuffer);
      const bytesB = new Uint8Array(b as ArrayBuffer);
      for (let i = 0; i < Math.min(bytesA.length, bytesB.length); i++) {
        if (bytesA[i] !== bytesB[i]) {
          return bytesA[i]! < bytesB[i]! ? -1 : 1;
        }
      }
      return bytesA.length - bytesB.length;
    }
    case 7:
      return compareArrays(
        a as ReadonlyArray<Value>,
        b as ReadonlyArray<Value>,
      );
    default: {
      const entriesA = Object.entries(a as Record<string, Value>).sort(
        ([keyA], [keyB]) => (keyA < keyB ? -1 : keyA > keyB ? 1 : 0),
      );
      const entriesB = Object.entries(b as Record<string, Value>).sort(
        ([keyA], [keyB]) => (keyA < keyB ? -1 : keyA > keyB ? 1 : 0),
      );
      for (let i = 0; i < Math.min(entriesA.length, entriesB.length); i++) {
        const [keyA, valueA] = entriesA[i]!;
        const [keyB, valueB] = entriesB[i]!;
        if (keyA !== keyB) {
          return keyA < keyB ? -1 : 1;
        }
        const cmp = compareValues(valueA, valueB);
        if (cmp !== 0) {
          return cmp;
        }
      }
      return entriesA.length - entriesB.length;
    }
  }
};

const compareArrays = (
  a: ReadonlyArray<Value | undefined>,
  b: ReadonlyArray<Value | undefined>,
): number => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const cmp = compareValues(a[i], b[i]);
    if (cmp !== 0) {
      return cmp;
    }
  }
  return a.length - b.length;
};

export const compareOrderKeys = compareArrays;

/** Compare positions in stream order: for `desc`, later keys are smaller. */
const positionCompare = (order: "asc" | "desc") => (a: OrderKey, b: OrderKey) =>
  order === "asc" ? compareOrderKeys(a, b) : -compareOrderKeys(a, b);

// -----------------------------------------------------------------------------
// QueryStream
// -----------------------------------------------------------------------------

/**
 * An Effect `Stream` of decoded documents in index order, carrying the order
 * key of each element so compositions stay mergeable and paginable.
 *
 * `Key` is the type-level order-key witness: the index fields that still
 * vary. Streams with different `Key`s cannot be merged (a type error), and
 * applying a generic `Stream` combinator degrades a `QueryStream` to a plain
 * `Stream` — which is honest: generic combinators can't maintain cursor
 * accounting, so the result is consumable but no longer paginable.
 */
export class QueryStream<
  out Doc,
  Key extends ReadonlyArray<string> = ReadonlyArray<string>,
  out E = never,
  out R = never,
> implements Stream.Stream<Doc, E, R> {
  declare readonly _Key: (_: Key) => Key;

  // `effect/Streamable`'s `Class` declaration types the `Stream` variance
  // struct with `never`s and `pipe` as `(): unknown`, which breaks
  // type-parameter inference (`Stream.map(qs, f)` would infer `A = never`)
  // and pipeable overloads — so implement its small protocol directly
  // instead of extending it. These members are `declare`d with their real
  // types and wired up on the prototype below.
  declare readonly [Stream.StreamTypeId]: Stream.Stream.VarianceStruct<
    Doc,
    E,
    R
  >;
  declare readonly pipe: Pipeable["pipe"];

  constructor(
    readonly order: "asc" | "desc",
    /** Names of the order-key fields (runtime; ends with `_id`). */
    readonly keyFields: ReadonlyArray<string>,
    /** The annotated elements; `None` = read but filtered out. */
    readonly annotated: Stream.Stream<Element<Doc>, E, R>,
  ) {}

  toStream(): Stream.Stream<Doc, E, R> {
    return Stream.filterMap(this.annotated, ([doc, _key]) => doc);
  }
}

const streamVariance = {
  _R: identity,
  _E: identity,
  _A: identity,
};

// (`prototype` is widened so the Effect language service doesn't flag the
// `defineProperties` return value — an Effect-able — as floating.)
const queryStreamPrototype: object = QueryStream.prototype;

Object.defineProperties(queryStreamPrototype, {
  [Stream.StreamTypeId]: { value: streamVariance },
  pipe: {
    // eslint-disable-next-line object-shorthand
    value: function (this: unknown) {
      return pipeArguments(this, arguments);
    },
  },
  // The Stream runtime unwraps implementations through this internal getter
  // (the `Streamable` protocol).
  channel: {
    get(this: QueryStream<unknown>) {
      return Stream.toChannel(this.toStream());
    },
  },
});

export type Any = QueryStream<any, ReadonlyArray<string>, any, any>;

// -----------------------------------------------------------------------------
// Constructors
// -----------------------------------------------------------------------------

/**
 * Build a `QueryStream` from a Convex ordered query. `makeQuery` is a thunk
 * so each run of the stream issues a fresh query. Order keys are extracted
 * from the *encoded* document before schema decoding.
 */
export const fromQuery = <Doc>(options: {
  readonly makeQuery: () => AsyncIterable<unknown>;
  readonly tableName: string;
  readonly tableSchema: Schema.Schema.AnyNoContext;
  readonly order: "asc" | "desc";
  readonly keyFields: ReadonlyArray<string>;
}): QueryStream<Doc, ReadonlyArray<string>, Document.DocumentDecodeError> => {
  const annotated = Stream.suspend(() =>
    Stream.fromAsyncIterable(options.makeQuery(), identity),
  ).pipe(
    Stream.orDie,
    Stream.mapEffect((encoded) =>
      Effect.map(
        Document.decode(options.tableName, options.tableSchema)(encoded),
        (doc) =>
          [
            Option.some(doc as Doc),
            extractOrderKey(
              encoded as Record<string, unknown>,
              options.keyFields,
            ),
          ] as const,
      ),
    ),
  );

  return new QueryStream(options.order, options.keyFields, annotated);
};

const extractOrderKey = (
  encoded: Record<string, unknown>,
  keyFields: ReadonlyArray<string>,
): OrderKey =>
  keyFields.map((fieldPath) =>
    fieldPath
      .split(".")
      .reduce<unknown>(
        (value, segment) =>
          (value as Record<string, unknown> | undefined)?.[segment],
        encoded,
      ),
  ) as OrderKey;

// -----------------------------------------------------------------------------
// Combinators
// -----------------------------------------------------------------------------

/**
 * Merge streams ordered by the same key into one ordered stream — SQL's
 * `UNION ALL` as a k-way ordered merge. Streams with different order keys or
 * directions are a **type error** (`Key` is invariant); the runtime check
 * below only guards untyped call sites.
 */
export const merge = <Doc, Key extends ReadonlyArray<string>, E, R>(
  streams: readonly [
    QueryStream<Doc, Key, E, R>,
    ...ReadonlyArray<QueryStream<Doc, Key, E, R>>,
  ],
): QueryStream<Doc, Key, E, R> => {
  const [head, ...rest] = streams;
  for (const other of rest) {
    if (other.order !== head.order) {
      throw new Error(
        "QueryStream.merge: all streams must have the same order",
      );
    }
    if (
      other.keyFields.length !== head.keyFields.length ||
      other.keyFields.some((field, i) => field !== head.keyFields[i])
    ) {
      throw new Error(
        `QueryStream.merge: all streams must share order-key fields (got [${head.keyFields.join(", ")}] and [${other.keyFields.join(", ")}])`,
      );
    }
  }

  const cmp = positionCompare(head.order);

  const annotated: Stream.Stream<Element<Doc>, E, R> = Stream.unwrapScoped(
    Effect.map(
      Effect.all(streams.map((s) => Stream.toPull(s.annotated))),
      (pulls) => {
        const sources = pulls.map((pull) => ({
          pull,
          buffer: [] as Array<Element<Doc>>,
          done: false,
        }));

        return Stream.repeatEffectOption(
          Effect.gen(function* () {
            for (const source of sources) {
              while (!source.done && source.buffer.length === 0) {
                yield* source.pull.pipe(
                  Effect.map((chunk) => {
                    for (const element of chunk) {
                      source.buffer.push(element);
                    }
                  }),
                  Effect.catchAll(
                    Option.match({
                      onNone: () =>
                        Effect.sync(() => {
                          source.done = true;
                        }),
                      onSome: (error: E) => Effect.fail(Option.some(error)),
                    }),
                  ),
                );
              }
            }

            let best: (typeof sources)[number] | undefined;
            for (const source of sources) {
              if (source.buffer.length === 0) {
                continue;
              }
              if (
                best === undefined ||
                cmp(source.buffer[0]![1], best.buffer[0]![1]) < 0
              ) {
                best = source;
              }
            }

            if (best === undefined) {
              return yield* Effect.fail(Option.none());
            }
            return best.buffer.shift()!;
          }),
        );
      },
    ),
  );

  return new QueryStream(head.order, head.keyFields, annotated);
};

/**
 * Filter with an effectful predicate. Unlike `Stream.filter`, filtered-out
 * elements still advance cursors, so the result remains paginable. The
 * predicate's `E2`/`R2` flow into the stream's channels.
 */
export const filterEffect = dual<
  <Doc, E2, R2>(
    predicate: (doc: Doc) => Effect.Effect<boolean, E2, R2>,
  ) => <Key extends ReadonlyArray<string>, E, R>(
    self: QueryStream<Doc, Key, E, R>,
  ) => QueryStream<Doc, Key, E | E2, R | R2>,
  <Doc, Key extends ReadonlyArray<string>, E, R, E2, R2>(
    self: QueryStream<Doc, Key, E, R>,
    predicate: (doc: Doc) => Effect.Effect<boolean, E2, R2>,
  ) => QueryStream<Doc, Key, E | E2, R | R2>
>(
  2,
  (self, predicate) =>
    new QueryStream(
      self.order,
      self.keyFields,
      Stream.mapEffect(self.annotated, ([doc, key]) =>
        Option.match(doc, {
          onNone: () => Effect.succeed([Option.none<never>(), key] as const),
          onSome: (value) =>
            Effect.map(
              predicate(value),
              (keep) =>
                [keep ? Option.some(value) : Option.none(), key] as const,
            ),
        }),
      ),
    ),
);

/**
 * Transform elements while preserving order keys, so the result remains
 * mergeable and paginable (unlike `Stream.mapEffect`, which degrades to a
 * plain `Stream`). The mapper must not change the ordering semantics.
 */
export const mapEffect = dual<
  <Doc, Doc2, E2, R2>(
    f: (doc: Doc) => Effect.Effect<Doc2, E2, R2>,
  ) => <Key extends ReadonlyArray<string>, E, R>(
    self: QueryStream<Doc, Key, E, R>,
  ) => QueryStream<Doc2, Key, E | E2, R | R2>,
  <Doc, Key extends ReadonlyArray<string>, E, R, Doc2, E2, R2>(
    self: QueryStream<Doc, Key, E, R>,
    f: (doc: Doc) => Effect.Effect<Doc2, E2, R2>,
  ) => QueryStream<Doc2, Key, E | E2, R | R2>
>(
  2,
  (self, f) =>
    new QueryStream(
      self.order,
      self.keyFields,
      Stream.mapEffect(self.annotated, ([doc, key]) =>
        Option.match(doc, {
          onNone: () => Effect.succeed([Option.none<never>(), key] as const),
          onSome: (value) =>
            Effect.map(
              f(value),
              (mapped) => [Option.some(mapped), key] as const,
            ),
        }),
      ),
    ),
);

/**
 * Restrict a stream to order keys strictly after `after` and at-or-before
 * `until` (in stream order). Prototype: filters in memory; production would
 * push these bounds down into `withIndex` ranges.
 */
export const narrow = dual<
  (bounds: {
    readonly after?: OrderKey | undefined;
    readonly until?: OrderKey | undefined;
  }) => <Doc, Key extends ReadonlyArray<string>, E, R>(
    self: QueryStream<Doc, Key, E, R>,
  ) => QueryStream<Doc, Key, E, R>,
  <Doc, Key extends ReadonlyArray<string>, E, R>(
    self: QueryStream<Doc, Key, E, R>,
    bounds: {
      readonly after?: OrderKey | undefined;
      readonly until?: OrderKey | undefined;
    },
  ) => QueryStream<Doc, Key, E, R>
>(2, (self, bounds) => {
  const cmp = positionCompare(self.order);
  let annotated = self.annotated;
  const after = bounds.after;
  if (after !== undefined) {
    annotated = Stream.dropWhile(annotated, ([, key]) => cmp(key, after) <= 0);
  }
  const until = bounds.until;
  if (until !== undefined) {
    annotated = Stream.takeWhile(annotated, ([, key]) => cmp(key, until) <= 0);
  }
  return new QueryStream(self.order, self.keyFields, annotated);
});

// -----------------------------------------------------------------------------
// Sinks
// -----------------------------------------------------------------------------

export class NotUniqueError extends Schema.TaggedError<NotUniqueError>()(
  "NotUniqueError",
  {},
) {
  override get message(): string {
    return "Expected the query stream to contain at most one document";
  }
}

/** Expect zero or one element; fail with `NotUniqueError` on two or more. */
export const unique = <Doc, Key extends ReadonlyArray<string>, E, R>(
  self: QueryStream<Doc, Key, E, R>,
): Effect.Effect<Option.Option<Doc>, E | NotUniqueError, R> =>
  self.pipe(
    Stream.take(2),
    Stream.runCollect,
    Effect.flatMap((chunk) =>
      Chunk.size(chunk) >= 2
        ? Effect.fail(new NotUniqueError())
        : Effect.succeed(Chunk.head(chunk)),
    ),
  );

// -----------------------------------------------------------------------------
// Pagination
// -----------------------------------------------------------------------------

const UNDEFINED_SENTINEL = { $undefined: true } as const;

export const serializeCursor = (key: OrderKey): string =>
  JSON.stringify(
    key.map((value) =>
      value === undefined ? UNDEFINED_SENTINEL : convexToJson(value),
    ),
  );

export const deserializeCursor = (cursor: string): OrderKey =>
  (JSON.parse(cursor) as ReadonlyArray<unknown>).map((value) =>
    typeof value === "object" && value !== null && "$undefined" in value
      ? undefined
      : jsonToConvex(value as Parameters<typeof jsonToConvex>[0]),
  );

/** The cursor denoting the end of the stream. */
export const END_CURSOR = "[]";

export interface PaginateOptions {
  readonly numItems: number;
  readonly cursor: string | null;
  readonly endCursor?: string | null | undefined;
  readonly id?: number | undefined;
  readonly maximumRowsRead?: number | undefined;
  readonly maximumBytesRead?: number | undefined;
}

export interface PaginationResult<Doc> {
  page: Array<Doc>;
  isDone: boolean;
  continueCursor: string;
  splitCursor?: string;
  pageStatus?: "SplitRecommended" | "SplitRequired";
}

interface PaginateState<Doc> {
  readonly page: Array<Doc>;
  readonly readKeys: Array<OrderKey>;
  stopped: boolean;
  hitLimit: boolean;
}

/**
 * Consume one page of a stream. Semantics follow
 * `convex-helpers/server/stream`:
 *
 * - `cursor` is exclusive, `endCursor` inclusive; when `endCursor` is set,
 *   `numItems` is ignored and the page runs to the end cursor — the
 *   reactive-adjacency guarantee that keeps concurrent pages gap-free.
 * - Filtered-out elements count as read (for `maximumRowsRead`) and advance
 *   the continue cursor.
 */
export const paginate = dual<
  (
    options: PaginateOptions,
  ) => <Doc, Key extends ReadonlyArray<string>, E, R>(
    self: QueryStream<Doc, Key, E, R>,
  ) => Effect.Effect<PaginationResult<Doc>, E, R>,
  <Doc, Key extends ReadonlyArray<string>, E, R>(
    self: QueryStream<Doc, Key, E, R>,
    options: PaginateOptions,
  ) => Effect.Effect<PaginationResult<Doc>, E, R>
>(
  2,
  <Doc, Key extends ReadonlyArray<string>, E, R>(
    self: QueryStream<Doc, Key, E, R>,
    options: PaginateOptions,
  ) =>
    Effect.suspend(() => {
      if (options.numItems === 0) {
        if (options.cursor === null) {
          return Effect.die(
            new Error(
              "QueryStream.paginate: numItems of 0 with a null cursor is not supported",
            ),
          );
        }
        return Effect.succeed<PaginationResult<Doc>>({
          page: [],
          isDone: false,
          continueCursor: options.cursor,
        });
      }

      const after =
        options.cursor === null ? undefined : deserializeCursor(options.cursor);
      const hasEndCursor =
        options.endCursor !== null &&
        options.endCursor !== undefined &&
        options.endCursor !== END_CURSOR;
      const until = hasEndCursor
        ? deserializeCursor(options.endCursor!)
        : undefined;
      const narrowed = narrow(self, { after, until });
      // With an endCursor the page runs to it, however many items that is.
      const maxRows =
        options.endCursor !== null && options.endCursor !== undefined
          ? undefined
          : options.numItems;
      const maximumRowsRead = options.maximumRowsRead;

      return Stream.runFoldWhile(
        narrowed.annotated,
        {
          page: [],
          readKeys: [],
          stopped: false,
          hitLimit: false,
        } as PaginateState<Doc>,
        (state) => !state.stopped,
        (state, [doc, key]) => {
          state.readKeys.push(key);
          if (Option.isSome(doc)) {
            state.page.push(doc.value);
          }
          state.hitLimit =
            maximumRowsRead !== undefined &&
            state.readKeys.length >= maximumRowsRead;
          state.stopped =
            state.hitLimit ||
            (maxRows !== undefined && state.page.length >= maxRows);
          return state;
        },
      ).pipe(
        Effect.map((state): PaginationResult<Doc> => {
          const lastReadKey = state.readKeys[state.readKeys.length - 1];
          if (state.stopped && lastReadKey !== undefined) {
            const result: PaginationResult<Doc> = {
              page: state.page,
              isDone: false,
              continueCursor: serializeCursor(lastReadKey),
            };
            if (state.hitLimit) {
              result.pageStatus = "SplitRequired";
              result.splitCursor = serializeCursor(
                state.readKeys[Math.floor((state.readKeys.length - 1) / 2)]!,
              );
            }
            return result;
          }
          // The narrowed stream was exhausted: either we reached the end
          // cursor (more may follow it) or the true end of the stream.
          return {
            page: state.page,
            isDone: !hasEndCursor,
            continueCursor: hasEndCursor ? options.endCursor! : END_CURSOR,
          };
        }),
      );
    }),
);
