import type { OrderedQuery, PaginationResult } from "convex/server";
import { Chunk, Effect, identity, type Option, pipe, Stream } from "effect";
import * as ConfectDocument from "./ConfectDocument";
import type * as ConfectTableInfo from "./ConfectTableInfo";

export type ConfectOrderedQuery<
  ConfectTableInfo_ extends ConfectTableInfo.ConfectTableInfo.AnyWithProps,
  _TableName extends string,
> = {
  readonly first: () => Effect.Effect<
    Option.Option<ConfectTableInfo_["confectDocument"]>,
    ConfectDocument.DocumentDecodeError
  >;
  readonly take: (
    n: number,
  ) => Effect.Effect<
    ReadonlyArray<ConfectTableInfo_["confectDocument"]>,
    ConfectDocument.DocumentDecodeError
  >;
  readonly collect: () => Effect.Effect<
    ReadonlyArray<ConfectTableInfo_["confectDocument"]>,
    ConfectDocument.DocumentDecodeError
  >;
  readonly stream: () => Stream.Stream<
    ConfectTableInfo_["confectDocument"],
    ConfectDocument.DocumentDecodeError
  >;
  readonly paginate: (options: {
    cursor: string | null;
    numItems: number;
  }) => Effect.Effect<
    PaginationResult<ConfectTableInfo_["confectDocument"]>,
    ConfectDocument.DocumentDecodeError
  >;
};

export const make = <
  ConfectTableInfo_ extends ConfectTableInfo.ConfectTableInfo.AnyWithProps,
  TableName extends string,
>(
  query: OrderedQuery<
    ConfectTableInfo.ConfectTableInfo.TableInfo<ConfectTableInfo_>
  >,
  tableName: TableName,
  tableSchema: ConfectTableInfo.ConfectTableInfo.TableSchema<ConfectTableInfo_>,
): ConfectOrderedQuery<ConfectTableInfo_, TableName> => {
  type ConfectOrderedQueryFunction<
    FunctionName extends keyof ConfectOrderedQuery<
      ConfectTableInfo_,
      TableName
    >,
  > = ConfectOrderedQuery<ConfectTableInfo_, TableName>[FunctionName];

  const streamEncoded = Stream.fromAsyncIterable(query, identity).pipe(
    Stream.orDie,
  );

  const stream: ConfectOrderedQueryFunction<"stream"> = () =>
    pipe(
      streamEncoded,
      Stream.mapEffect(ConfectDocument.decode(tableName, tableSchema)),
    );

  const first: ConfectOrderedQueryFunction<"first"> = () =>
    pipe(stream(), Stream.take(1), Stream.runHead);

  const take: ConfectOrderedQueryFunction<"take"> = (n: number) =>
    pipe(
      stream(),
      Stream.take(n),
      Stream.runCollect,
      Effect.map((chunk) => Chunk.toReadonlyArray(chunk)),
    );

  const collect: ConfectOrderedQueryFunction<"collect"> = () =>
    pipe(stream(), Stream.runCollect, Effect.map(Chunk.toReadonlyArray));

  const paginate: ConfectOrderedQueryFunction<"paginate"> = (options) =>
    Effect.gen(function* () {
      const paginationResult = yield* Effect.promise(() =>
        query.paginate(options),
      );

      const parsedPage = yield* Effect.forEach(
        paginationResult.page,
        ConfectDocument.decode(tableName, tableSchema),
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
