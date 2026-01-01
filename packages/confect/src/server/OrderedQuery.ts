import type {
  OrderedQuery as ConvexOrderedQuery,
  PaginationResult,
} from "convex/server";
import { Chunk, Effect, identity, type Option, pipe, Stream } from "effect";
import * as Document from "./Document";
import type * as TableInfo from "./TableInfo";

export type OrderedQuery<
  TableInfo_ extends TableInfo.TableInfo.AnyWithProps,
  _TableName extends string,
> = {
  readonly first: () => Effect.Effect<
    Option.Option<TableInfo_["document"]>,
    Document.DocumentDecodeError
  >;
  readonly take: (
    n: number,
  ) => Effect.Effect<
    ReadonlyArray<TableInfo_["document"]>,
    Document.DocumentDecodeError
  >;
  readonly collect: () => Effect.Effect<
    ReadonlyArray<TableInfo_["document"]>,
    Document.DocumentDecodeError
  >;
  readonly stream: () => Stream.Stream<
    TableInfo_["document"],
    Document.DocumentDecodeError
  >;
  readonly paginate: (options: {
    cursor: string | null;
    numItems: number;
  }) => Effect.Effect<
    PaginationResult<TableInfo_["document"]>,
    Document.DocumentDecodeError
  >;
};

export const make = <
  TableInfo_ extends TableInfo.TableInfo.AnyWithProps,
  TableName extends string,
>(
  query: ConvexOrderedQuery<TableInfo.TableInfo.TableInfo<TableInfo_>>,
  tableName: TableName,
  tableSchema: TableInfo.TableInfo.TableSchema<TableInfo_>,
): OrderedQuery<TableInfo_, TableName> => {
  type OrderedQueryFunction<
    FunctionName extends keyof OrderedQuery<TableInfo_, TableName>,
  > = OrderedQuery<TableInfo_, TableName>[FunctionName];

  const streamEncoded = Stream.fromAsyncIterable(query, identity).pipe(
    Stream.orDie,
  );

  const stream: OrderedQueryFunction<"stream"> = () =>
    pipe(
      streamEncoded,
      Stream.mapEffect(Document.decode(tableName, tableSchema)),
    );

  const first: OrderedQueryFunction<"first"> = () =>
    pipe(stream(), Stream.take(1), Stream.runHead);

  const take: OrderedQueryFunction<"take"> = (n: number) =>
    pipe(
      stream(),
      Stream.take(n),
      Stream.runCollect,
      Effect.map((chunk) => Chunk.toReadonlyArray(chunk)),
    );

  const collect: OrderedQueryFunction<"collect"> = () =>
    pipe(stream(), Stream.runCollect, Effect.map(Chunk.toReadonlyArray));

  const paginate: OrderedQueryFunction<"paginate"> = (options) =>
    Effect.gen(function* () {
      const paginationResult = yield* Effect.promise(() =>
        query.paginate(options),
      );

      const parsedPage = yield* Effect.forEach(
        paginationResult.page,
        Document.decode(tableName, tableSchema),
      );

      return {
        page: parsedPage,
        isDone: paginationResult.isDone,
        continueCursor: paginationResult.continueCursor,
        /* v8 ignore start */
        ...(paginationResult.splitCursor
          ? { splitCursor: paginationResult.splitCursor }
          : {}),
        ...(paginationResult.pageStatus
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
