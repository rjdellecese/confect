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
 * Ordered reads from the standard index selected by
 * `reader.table(handle).index(...)` or the relevance-ranked results of
 * `.search(...)`. Each consumer decodes stored documents with the table codec.
 * Decoding can fail with `DocumentDecodeError`; native query failures are
 * defects.
 *
 * @category Models
 */
export type OrderedQuery<
  TableInfo_ extends TableInfo.AnyWithProps,
  Doc = TableInfo_["document"],
> = {
  /**
   * Reads the first match in query order, returning `None` when no document
   * matches.
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
   * Reads up to `n` matching documents in query order.
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
   * Reads and decodes every matching document in query order.
   *
   * **Gotchas**
   *
   * Collecting a large result can exceed Convex's transaction limits. Bound the
   * result with `take` or read one page at a time with `paginate`.
   *
   * @category Reading
   *
   * @returns An effect yielding a readonly array, or failing with
   *   `DocumentDecodeError`.
   */
  readonly collect: () => Effect.Effect<
    ReadonlyArray<Doc>,
    Document.DocumentDecodeError
  >;
  /**
   * Returns a plain Effect `Stream` that decodes matching documents as they are
   * consumed.
   *
   * **When to use**
   *
   * Use to consume one ordered query with Effect's stream operators. For a
   * mergeable, paginable query stream, start from
   * `reader.table(handle).stream(index)` instead.
   *
   * @category Reading
   *
   * @returns A plain stream of decoded documents with `DocumentDecodeError` in
   *   its error channel.
   */
  readonly stream: () => Stream.Stream<Doc, Document.DocumentDecodeError>;
  /**
   * Reads one native Convex page and decodes its documents. Pass the handler's
   * `paginationOpts` through unchanged and return the whole result so the
   * client receives Convex's continuation and split information.
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
   * @returns An effect yielding the decoded `page`, `isDone`, and
   *   `continueCursor`, with `splitCursor` and `pageStatus` when supplied by
   *   Convex. Decoding can fail with `DocumentDecodeError`; native failures are
   *   defects.
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
        Effect.forEach(encoded, Document.decode(table), { concurrency: 1 }),
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
      { concurrency: 1 },
    );

    const result: PaginationResult<TableInfo_["document"]> = {
      page: parsedPage,
      isDone: paginationResult.isDone,
      continueCursor: paginationResult.continueCursor,
    };
    /* v8 ignore start */
    if (
      paginationResult.splitCursor !== undefined &&
      paginationResult.splitCursor !== null &&
      paginationResult.splitCursor !== ""
    ) {
      result.splitCursor = paginationResult.splitCursor;
    }
    if (
      paginationResult.pageStatus !== undefined &&
      paginationResult.pageStatus !== null
    ) {
      result.pageStatus = paginationResult.pageStatus;
    }
    /* v8 ignore stop */
    return result;
  });

  return {
    first,
    take,
    collect,
    paginate,
    stream,
  };
};
