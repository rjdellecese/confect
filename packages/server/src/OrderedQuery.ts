import type {
  ExpressionOrValue,
  FilterBuilder,
  OrderedQuery as ConvexOrderedQuery,
  PaginationOptions,
  PaginationResult,
} from "convex/server";
import { identity, pipe } from "effect/Function";
import type { Option } from "effect";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as Document from "./Document";
import type * as TableInfo from "./TableInfo";
import type * as Table from "./Table";

/**
 * Consumers for a table's standard-index or relevance-ordered search query.
 * Obtain this from `reader.table(name).index(...)` or `.search(...)`. Results
 * are decoded documents. Codec failures are typed `DocumentDecodeError`s;
 * native query failures remain defects.
 *
 * @category Models
 */
export type OrderedQuery<
  TableInfo_ extends TableInfo.AnyWithProps,
  Doc = TableInfo_["document"],
> = {
  /**
   * Read at most the first matching document in query order.
   *
   * @category Reading
   *
   * @returns An effect yielding `Some(document)` or `None` when there is no
   *   match; decoding the stored document can fail with `DocumentDecodeError`.
   */
  readonly first: () => Effect.Effect<
    Option.Option<Doc>,
    Document.DocumentDecodeError
  >;
  /**
   * Read a bounded prefix in query order.
   *
   * @category Reading
   *
   * @param n - Maximum number of documents to return, validated by Convex.
   *
   * @returns An effect yielding up to n decoded documents, possibly an empty
   *   array. A decoding failure fails the effect with `DocumentDecodeError`.
   */
  readonly take: (
    n: number,
  ) => Effect.Effect<ReadonlyArray<Doc>, Document.DocumentDecodeError>;
  /**
   * Read every matching document in query order.
   *
   * @category Reading
   *
   * @returns An effect yielding a readonly array, or failing with
   *   `DocumentDecodeError`. Prefer bounded reads or pagination for large
   *   queries to avoid exceeding Convex's transaction limits.
   */
  readonly collect: () => Effect.Effect<
    ReadonlyArray<Doc>,
    Document.DocumentDecodeError
  >;
  /**
   * Consume matching documents incrementally as an Effect Stream.
   *
   * @category Reading
   *
   * @returns A plain stream of decoded documents with `DocumentDecodeError` in
   *   its error channel. It is not a composable QueryStream; use
   *   `reader.table(name).stream(index)` for mergeable, paginable composition.
   */
  readonly stream: () => Stream.Stream<Doc, Document.DocumentDecodeError>;
  /**
   * Fetch and decode one native Convex pagination page.
   *
   * @category Reading
   *
   * @param options - Convex pagination options, normally the handler's
   *   `paginationOpts` unchanged. `cursor: null` starts a query; `numItems`
   *   requests its page size. Optional protocol fields are forwarded to
   *   Convex.
   * @param filter - Optional native Convex filter builder over stored field
   *   values, for example `q => q.eq(q.field("author"), author)`.
   *
   * @returns An effect yielding decoded `page`, `isDone`, and `continueCursor`,
   *   plus `splitCursor` and `pageStatus` when provided by Convex. Pass cursors
   *   back unchanged. Decoding fails with `DocumentDecodeError`; native
   *   failures are defects. Return the whole result from a paginated query
   *   handler.
   */
  readonly paginate: (
    options: PaginationOptions,
    filter?: (
      q: FilterBuilder<TableInfo.ConvexTableInfo<TableInfo_>>,
    ) => ExpressionOrValue<boolean>,
  ) => Effect.Effect<PaginationResult<Doc>, Document.DocumentDecodeError>;
};

/**
 * @internal
 */
export const make = <Table_ extends Table.AnyWithProps>(
  query: ConvexOrderedQuery<
    TableInfo.ConvexTableInfo<TableInfo.TableInfo<Table_>>
  >,
  table: Table_,
): OrderedQuery<TableInfo.TableInfo<Table_>> => {
  type TableInfo_ = TableInfo.TableInfo<Table_>;
  type OrderedQueryFunction<
    FunctionName extends keyof OrderedQuery<TableInfo_>,
  > = OrderedQuery<TableInfo_>[FunctionName];

  const streamEncoded = Stream.fromAsyncIterable(query, identity).pipe(
    Stream.orDie,
  );

  const stream: OrderedQueryFunction<"stream"> = () =>
    pipe(streamEncoded, Stream.mapEffect(Document.decode(table)));

  const collect: OrderedQueryFunction<"collect"> = () =>
    pipe(stream(), Stream.runCollect);

  const take: OrderedQueryFunction<"take"> = (n: number) =>
    pipe(
      Effect.promise(() => query.take(n)),
      Effect.flatMap((encoded) =>
        Effect.forEach(encoded, Document.decode(table)),
      ),
    );

  const first: OrderedQueryFunction<"first"> = () =>
    Effect.map(take(1), Array.head);

  const paginate: OrderedQueryFunction<"paginate"> = Effect.fn(
    "OrderedQuery.paginate",
  )(function* (options, filter) {
    const filteredQuery = filter !== undefined ? query.filter(filter) : query;

    const paginationResult = yield* Effect.promise(() =>
      filteredQuery.paginate(options),
    );

    const parsedPage = yield* Effect.forEach(
      paginationResult.page,
      Document.decode(table),
    );

    return {
      page: parsedPage,
      isDone: paginationResult.isDone,
      continueCursor: paginationResult.continueCursor,
      /* v8 ignore start */
      ...(paginationResult.splitCursor !== undefined &&
      paginationResult.splitCursor !== null &&
      paginationResult.splitCursor !== ""
        ? { splitCursor: paginationResult.splitCursor }
        : {}),
      ...(paginationResult.pageStatus !== undefined &&
      paginationResult.pageStatus !== null
        ? { pageStatus: paginationResult.pageStatus }
        : {}),
      /* v8 ignore stop */
    };
  });

  return {
    first,
    take,
    collect,
    paginate,
    stream,
  };
};
