import type {
  BetterOmit,
  DocumentByInfo,
  DocumentByName,
  Expand,
  FieldTypeFromFieldPath,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericDataModel,
  GenericDocument,
  GenericTableIndexes,
  Indexes,
  IndexRange,
  IndexRangeBuilder,
  NamedIndex,
  NamedSearchIndex,
  OrderedQuery,
  PaginationResult,
  Query,
  SearchFilter,
  SearchFilterBuilder,
  SearchIndexes,
  TableNamesInDataModel,
  WithoutSystemFields,
} from "convex/server";
import type { GenericId } from "convex/values";
import {
  Array,
  Chunk,
  Effect,
  Either,
  identity,
  Layer,
  Option,
  ParseResult,
  pipe,
  Record,
  Schema,
  Stream,
  Struct,
} from "effect";
import { dual } from "effect/Function";
import type {
  ConfectDocumentByName,
  DataModelFromConfectDataModel,
  GenericConfectDataModel,
  GenericConfectDocument,
  GenericConfectDocumentWithSystemFields,
  GenericConfectTableInfo,
  TableInfoFromConfectTableInfo,
  TableNamesInConfectDataModel,
  TableSchemaFromConfectTableInfo,
} from "./data-model";
import {
  type ConfectDataModelFromConfectSchema,
  type ConfectDataModelFromConfectSchemaDefinition,
  confectSystemSchema,
  type ExtendWithConfectSystemSchema,
  extendWithConfectSystemSchema,
  type GenericConfectSchema,
  type GenericConfectSchemaDefinition,
  type TableNamesInConfectSchema,
} from "./schema";
import { extendWithSystemFields } from "./schemas/SystemFields";

export const makeConfectDatabaseServices = <
  ConfectSchemaDefinition extends GenericConfectSchemaDefinition,
>(
  confectSchemaDefinition: ConfectSchemaDefinition,
) => {
  ///////////
  // Types //
  ///////////

  type ConfectDataModel =
    ConfectDataModelFromConfectSchemaDefinition<ConfectSchemaDefinition>;

  type ConvexDataModel = DataModelFromConfectDataModel<ConfectDataModel>;

  type ConfectSchema = ConfectSchemaDefinition["confectSchema"];

  ///////////////////////////
  // ConfectDatabaseReader //
  ///////////////////////////

  type ConfectSchemaWithSystemTables =
    ExtendWithConfectSystemSchema<ConfectSchema>;

  const makeConfectDatabaseReader = (
    convexDatabaseReader: GenericDatabaseReader<
      DataModelFromConfectDataModel<
        ConfectDataModelFromConfectSchema<ConfectSchema>
      >
    >,
  ) => ({
    table: <
      TableName extends
        TableNamesInConfectSchema<ConfectSchemaWithSystemTables>,
    >(
      tableName: TableName,
    ) => {
      const confectTableDefinition = extendWithConfectSystemSchema(
        confectSchemaDefinition.confectSchema,
      )[tableName] as ConfectSchemaWithSystemTables[TableName];

      const baseDatabaseReader: BaseDatabaseReader<
        DataModelFromConfectDataModel<
          ConfectDataModelFromConfectSchema<ConfectSchemaWithSystemTables>
        >
      > = Array.some(
        Struct.keys(confectSystemSchema),
        (systemTableName) => systemTableName === tableName,
      )
        ? {
            get: convexDatabaseReader.system.get,
            query: convexDatabaseReader.system.query,
          }
        : {
            get: convexDatabaseReader.get,
            query: convexDatabaseReader.query,
          };

      return makeConfectQueryInitializer<
        ConfectSchemaWithSystemTables,
        TableName
      >(tableName, baseDatabaseReader, confectTableDefinition);
    },
  });

  class ConfectDatabaseReader extends Effect.Tag(
    "@rjdellecese/confect/ConfectDatabaseReader",
  )<ConfectDatabaseReader, ReturnType<typeof makeConfectDatabaseReader>>() {
    static readonly layer = (
      convexDatabaseReader: GenericDatabaseReader<
        DataModelFromConfectDataModel<
          ConfectDataModelFromConfectSchema<ConfectSchema>
        >
      >,
    ) => Layer.succeed(this, makeConfectDatabaseReader(convexDatabaseReader));
  }

  ///////////////////////////
  // ConfectDatabaseWriter //
  ///////////////////////////

  const makeConfectDatabaseWriter = (
    convexDatabaseWriter: GenericDatabaseWriter<ConvexDataModel>,
  ) => {
    const insert = <
      TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
    >(
      tableName: TableName,
      document: WithoutSystemFields<
        ConfectDocumentByName<ConfectDataModel, TableName>
      >,
    ) =>
      Effect.gen(function* () {
        const confectTableDefinition = confectSchemaDefinition.confectSchema[
          tableName
        ] as NonNullable<ConfectSchemaDefinition["confectSchema"][TableName]>;

        const encodedDocument = yield* encode(
          document,
          tableName,
          confectTableDefinition.tableSchema,
        );

        const id = yield* Effect.promise(() =>
          convexDatabaseWriter.insert(
            tableName,
            encodedDocument as Expand<
              BetterOmit<
                DocumentByName<
                  DataModelFromConfectDataModel<ConfectDataModel>,
                  TableName
                >,
                "_creationTime" | "_id"
              >
            >,
          ),
        );

        return id;
      });

    const patch = <
      TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
    >(
      tableName: TableName,
      id: GenericId<TableName>,
      patchedValues: Partial<
        WithoutSystemFields<ConfectDocumentByName<ConfectDataModel, TableName>>
      >,
    ) =>
      Effect.gen(function* () {
        const confectTableDefinition = confectSchemaDefinition.confectSchema[
          tableName
        ] as ConfectSchemaDefinition["confectSchema"][TableName];

        const tableSchema =
          confectTableDefinition.tableSchema as TableSchemaFromConfectTableInfo<
            ConfectDataModel[TableName]
          >;

        const originalDecodedDoc = yield* getById(
          tableName,
          convexDatabaseWriter,
          confectTableDefinition,
        )(id);

        const updatedEncodedDoc = yield* pipe(
          patchedValues,
          Record.reduce(originalDecodedDoc, (acc, value, key) =>
            value === undefined
              ? Record.remove(acc, key)
              : Record.set(acc, key, value),
          ),
          encode(tableName, tableSchema),
        );

        yield* Effect.promise(() =>
          convexDatabaseWriter.replace(
            id,
            updatedEncodedDoc as Expand<
              BetterOmit<
                DocumentByName<
                  DataModelFromConfectDataModel<ConfectDataModel>,
                  TableName
                >,
                "_creationTime" | "_id"
              >
            >,
          ),
        );
      });

    const replace = <
      TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
    >(
      tableName: TableName,
      id: GenericId<TableName>,
      value: WithoutSystemFields<
        ConfectDocumentByName<ConfectDataModel, TableName>
      >,
    ) =>
      Effect.gen(function* () {
        const confectTableDefinition = confectSchemaDefinition.confectSchema[
          tableName
        ] as ConfectSchemaDefinition["confectSchema"][TableName];

        const tableSchema =
          confectTableDefinition.tableSchema as TableSchemaFromConfectTableInfo<
            ConfectDataModel[TableName]
          >;

        const updatedEncodedDoc = yield* encode(value, tableName, tableSchema);

        yield* Effect.promise(() =>
          convexDatabaseWriter.replace(
            id,
            updatedEncodedDoc as Expand<
              BetterOmit<
                DocumentByName<
                  DataModelFromConfectDataModel<ConfectDataModel>,
                  TableName
                >,
                "_creationTime" | "_id"
              >
            >,
          ),
        );
      });

    const delete_ = <
      TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
    >(
      _tableName: TableName,
      id: GenericId<TableName>,
    ) => Effect.promise(() => convexDatabaseWriter.delete(id));

    return {
      insert,
      patch,
      replace,
      delete: delete_,
    };
  };

  class ConfectDatabaseWriter extends Effect.Tag(
    "@rjdellecese/confect/ConfectDatabaseWriter",
  )<ConfectDatabaseWriter, ReturnType<typeof makeConfectDatabaseWriter>>() {
    static readonly layer = (
      convexDatabaseWriter: GenericDatabaseWriter<ConvexDataModel>,
    ) => Layer.succeed(this, makeConfectDatabaseWriter(convexDatabaseWriter));
  }

  //////////////
  // SERVICES //
  //////////////

  return {
    ConfectDatabaseReader,
    ConfectDatabaseWriter,
  };
};

// Based on https://github.com/get-convex/convex-ents/blob/f1c6eda95569bdcd97efcc3431638b4260b004dc/src/shared.ts#L31-L44
export type IndexFieldTypesForEq<
  ConvexDataModel extends GenericDataModel,
  Table extends TableNamesInDataModel<ConvexDataModel>,
  T extends string[],
> = Pop<{
  [K in keyof T]: FieldTypeFromFieldPath<
    DocumentByName<ConvexDataModel, Table>,
    T[K]
  >;
}>;

type Pop<T extends any[]> = T extends [...infer Rest, infer _Last]
  ? Rest
  : never;
//

type ConfectQueryInitializer<
  ConfectDataModel extends GenericConfectDataModel,
  TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
> = {
  readonly getbyId: (
    id: GenericId<TableName>,
  ) => Effect.Effect<
    ConfectDataModel[TableName]["confectDocument"],
    DocumentDecodeError | DocumentNotFoundError
  >;
  readonly getManyById: (
    ids: readonly GenericId<TableName>[],
  ) => Effect.Effect<
    ConfectDataModel[TableName]["confectDocument"][],
    DocumentDecodeError | DocumentNotFoundError
  >;
  readonly getByIndex: <
    IndexName extends keyof Indexes<
      TableInfoFromConfectTableInfo<ConfectDataModel[TableName]>
    >,
  >(
    indexName: IndexName,
    ...indexFieldValues: IndexFieldTypesForEq<
      DataModelFromConfectDataModel<ConfectDataModel>,
      TableName,
      Indexes<
        TableInfoFromConfectTableInfo<ConfectDataModel[TableName]>
      >[IndexName]
    >
  ) => Effect.Effect<
    ConfectDataModel[TableName]["confectDocument"],
    DocumentDecodeError | NoDocumentsMatchQueryError
  >;
  readonly stream: () => Stream.Stream<
    ConfectDataModel[TableName]["confectDocument"],
    DocumentDecodeError
  >;
  readonly withIndex: <
    IndexName extends keyof Indexes<
      TableInfoFromConfectTableInfo<ConfectDataModel[TableName]>
    >,
  >(
    indexName: IndexName,
    indexRange?: (
      q: IndexRangeBuilder<
        ConfectDataModel[TableName]["convexDocument"],
        NamedIndex<
          TableInfoFromConfectTableInfo<ConfectDataModel[TableName]>,
          IndexName
        >
      >,
    ) => IndexRange,
  ) => ConfectQuery<ConfectDataModel[TableName], TableName>;
  readonly withSearchIndex: <
    IndexName extends keyof SearchIndexes<
      TableInfoFromConfectTableInfo<ConfectDataModel[TableName]>
    >,
  >(
    indexName: IndexName,
    searchFilter: (
      q: SearchFilterBuilder<
        DocumentByInfo<
          TableInfoFromConfectTableInfo<ConfectDataModel[TableName]>
        >,
        NamedSearchIndex<
          TableInfoFromConfectTableInfo<ConfectDataModel[TableName]>,
          IndexName
        >
      >,
    ) => SearchFilter,
  ) => ConfectOrderedQuery<ConfectDataModel[TableName], TableName>;
  readonly first: () => Effect.Effect<
    ConfectDataModel[TableName]["confectDocument"],
    DocumentDecodeError | NoDocumentsMatchQueryError
  >;
  readonly unique: () => Effect.Effect<
    ConfectDataModel[TableName]["confectDocument"],
    DocumentDecodeError | DocumentNotUniqueError | NoDocumentsMatchQueryError
  >;
  readonly take: (
    n: number,
  ) => Effect.Effect<
    ReadonlyArray<ConfectDataModel[TableName]["confectDocument"]>,
    DocumentDecodeError
  >;
  readonly collect: () => Effect.Effect<
    ReadonlyArray<ConfectDataModel[TableName]["confectDocument"]>,
    DocumentDecodeError
  >;
  readonly order: (
    order: "asc" | "desc",
  ) => ConfectOrderedQuery<ConfectDataModel[TableName], TableName>;
  readonly paginate: (options: {
    cursor: string | null;
    numItems: number;
  }) => Effect.Effect<
    PaginationResult<ConfectDataModel[TableName]["confectDocument"]>,
    DocumentDecodeError
  >;
};

const makeConfectQueryInitializer = <
  ConfectSchema extends GenericConfectSchema,
  TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
  ConfectDataModel extends
    GenericConfectDataModel = ConfectDataModelFromConfectSchema<ConfectSchema>,
  ConvexDataModel extends GenericDataModel = DataModelFromConfectDataModel<
    ConfectDataModelFromConfectSchema<ConfectSchema>
  >,
>(
  // TODO: Add error type for when ID is for the wrong table?
  tableName: TableName,
  convexDatabaseReader: BaseDatabaseReader<ConvexDataModel>,
  confectTableDefinition: ConfectSchema[TableName],
): ConfectQueryInitializer<ConfectDataModel, TableName> => {
  type ConfectQueryFunction<
    FunctionName extends keyof ConfectQueryInitializer<
      ConfectDataModel,
      TableName
    >,
  > = ConfectQueryInitializer<ConfectDataModel, TableName>[FunctionName];

  const getbyId: ConfectQueryFunction<"getbyId"> = getById(
    tableName,
    convexDatabaseReader,
    confectTableDefinition,
  );

  const getManyById: ConfectQueryFunction<"getManyById"> = (ids) =>
    Effect.forEach(ids, getbyId);

  const getByIndex: ConfectQueryFunction<"getByIndex"> = (
    indexName,
    ...indexFieldValues
  ) => {
    const indexFields: GenericTableIndexes[keyof GenericTableIndexes] =
      confectTableDefinition.indexes[indexName];

    return pipe(
      Effect.promise(() =>
        convexDatabaseReader
          .query(tableName)
          .withIndex(indexName, (q) =>
            Array.reduce(
              indexFieldValues,
              q,
              (q_, v, i) => q_.eq(indexFields[i] as any, v as any) as any,
            ),
          )
          .unique(),
      ),
      Effect.andThen(
        Either.fromNullable(
          () => new NoDocumentsMatchQueryError({ tableName }),
        ),
      ),
      Effect.andThen(decode(tableName, confectTableDefinition.tableSchema)),
    );
  };

  const streamEncoded = Stream.fromAsyncIterable(
    convexDatabaseReader.query(tableName),
    identity,
  ).pipe(Stream.orDie);

  const stream: ConfectQueryFunction<"stream"> = () =>
    pipe(
      streamEncoded,
      Stream.mapEffect(decode(tableName, confectTableDefinition.tableSchema)),
    );

  const withIndex: ConfectQueryFunction<"withIndex"> = (
    indexName,
    indexRange,
  ) =>
    makeConfectQuery<ConfectDataModel[TableName], TableName>(
      convexDatabaseReader.query(tableName).withIndex(indexName, indexRange),
      tableName,
      confectTableDefinition.tableSchema,
    );

  const withSearchIndex: ConfectQueryFunction<"withSearchIndex"> = (
    indexName,
    searchFilter,
  ) =>
    makeConfectOrderedQuery<ConfectDataModel[TableName], TableName>(
      convexDatabaseReader
        .query(tableName)
        .withSearchIndex(indexName, searchFilter),
      tableName,
      confectTableDefinition.tableSchema,
    );

  const first: ConfectQueryFunction<"first"> = () =>
    pipe(
      stream(),
      Stream.runHead,
      Effect.andThen(
        Option.match({
          onNone: () =>
            Effect.fail(new NoDocumentsMatchQueryError({ tableName })),
          onSome: decode(tableName, confectTableDefinition.tableSchema),
        }),
      ),
    );

  const unique: ConfectQueryFunction<"unique"> = () =>
    pipe(
      stream(),
      Stream.take(2),
      Stream.runCollect,
      Effect.andThen((chunk) =>
        Option.match(Chunk.get(chunk, 1), {
          onSome: (doc) =>
            new DocumentNotUniqueError({
              id: (doc as GenericConfectDocumentWithSystemFields)._id,
              tableName,
            }),
          onNone: () =>
            Option.match(Chunk.get(chunk, 0), {
              onSome: decode(tableName, confectTableDefinition.tableSchema),
              onNone: () =>
                Effect.fail(
                  new NoDocumentsMatchQueryError({
                    tableName,
                  }),
                ),
            }),
        }),
      ),
    );

  const take: ConfectQueryFunction<"take"> = (n: number) =>
    pipe(
      stream(),
      Stream.take(n),
      Stream.runCollect,
      Effect.map((chunk) => Chunk.toReadonlyArray(chunk)),
    );

  const collect: ConfectQueryFunction<"collect"> = () =>
    pipe(stream(), Stream.runCollect, Effect.map(Chunk.toReadonlyArray));

  const order: ConfectQueryFunction<"order"> = (order: "asc" | "desc") =>
    makeConfectOrderedQuery<ConfectDataModel[TableName], TableName>(
      convexDatabaseReader.query(tableName).order(order),
      tableName,
      confectTableDefinition.tableSchema,
    );

  const paginate: ConfectQueryFunction<"paginate"> = makePaginateFunction(
    (options) => convexDatabaseReader.query(tableName).paginate(options),
    decode(tableName, confectTableDefinition.tableSchema),
  );

  return {
    getbyId,
    getManyById,
    getByIndex,
    stream,
    withIndex,
    withSearchIndex,
    first,
    unique,
    take,
    collect,
    order,
    paginate,
  };
};

const getById =
  <
    ConfectSchema extends GenericConfectSchema,
    TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
    ConfectDataModel extends
      GenericConfectDataModel = ConfectDataModelFromConfectSchema<ConfectSchema>,
    ConvexDataModel extends GenericDataModel = DataModelFromConfectDataModel<
      ConfectDataModelFromConfectSchema<ConfectSchema>
    >,
  >(
    tableName: TableName,
    convexTableReader: BaseDatabaseReader<ConvexDataModel>,
    confectTableDefinition: ConfectSchema[TableName],
  ) =>
  (id: GenericId<TableName>) =>
    pipe(
      Effect.promise(() => convexTableReader.get(id)),
      Effect.andThen(
        Either.fromNullable(() => new DocumentNotFoundError({ tableName, id })),
      ),
      Effect.andThen(decode(tableName, confectTableDefinition.tableSchema)),
    );

type ConfectQuery<
  ConfectTableInfo extends GenericConfectTableInfo,
  TableName extends string,
> = {
  readonly order: (
    order: "asc" | "desc",
  ) => ConfectOrderedQuery<ConfectTableInfo, TableName>;
};

const makeConfectQuery = <
  ConfectTableInfo extends GenericConfectTableInfo,
  TableName extends string,
>(
  query: Query<TableInfoFromConfectTableInfo<ConfectTableInfo>>,
  tableName: TableName,
  tableSchema: TableSchemaFromConfectTableInfo<ConfectTableInfo>,
): ConfectQuery<ConfectTableInfo, TableName> => ({
  order: (order) =>
    makeConfectOrderedQuery<ConfectTableInfo, TableName>(
      query.order(order),
      tableName,
      tableSchema,
    ),
});

type ConfectOrderedQuery<
  ConfectTableInfo extends GenericConfectTableInfo,
  _TableName extends string,
> = {
  readonly first: () => Effect.Effect<
    ConfectTableInfo["confectDocument"],
    DocumentDecodeError | NoDocumentsMatchQueryError
  >;
  readonly unique: () => Effect.Effect<
    ConfectTableInfo["confectDocument"],
    DocumentDecodeError | DocumentNotUniqueError | NoDocumentsMatchQueryError
  >;
  readonly take: (
    n: number,
  ) => Effect.Effect<
    ReadonlyArray<ConfectTableInfo["confectDocument"]>,
    DocumentDecodeError
  >;
  readonly collect: () => Effect.Effect<
    ReadonlyArray<ConfectTableInfo["confectDocument"]>,
    DocumentDecodeError
  >;
  readonly stream: () => Stream.Stream<
    ConfectTableInfo["confectDocument"],
    DocumentDecodeError
  >;
  readonly paginate: (options: {
    cursor: string | null;
    numItems: number;
  }) => Effect.Effect<
    PaginationResult<ConfectTableInfo["confectDocument"]>,
    DocumentDecodeError
  >;
};

export class NoDocumentsMatchQueryError extends Schema.TaggedError<NoDocumentsMatchQueryError>(
  "NoDocumentsMatchQueryError",
)("NoDocumentsMatchQueryError", {
  tableName: Schema.String,
}) {
  override get message(): string {
    return `No documents match query for table '${this.tableName}'`;
  }
}

export class DocumentNotUniqueError extends Schema.TaggedError<DocumentNotUniqueError>(
  "DocumentNotUniqueError",
)("DocumentNotUniqueError", {
  id: Schema.String,
  tableName: Schema.String,
}) {
  override get message(): string {
    return documentQueryMessage({
      id: this.id,
      tableName: this.tableName,
      message: "is not unique in this query",
    });
  }
}

const makeConfectOrderedQuery = <
  ConfectTableInfo extends GenericConfectTableInfo,
  TableName extends string,
>(
  query: OrderedQuery<TableInfoFromConfectTableInfo<ConfectTableInfo>>,
  tableName: TableName,
  tableSchema: TableSchemaFromConfectTableInfo<ConfectTableInfo>,
): ConfectOrderedQuery<ConfectTableInfo, TableName> => {
  type ConfectOrderedQueryFunction<
    FunctionName extends keyof ConfectOrderedQuery<ConfectTableInfo, TableName>,
  > = ConfectOrderedQuery<ConfectTableInfo, TableName>[FunctionName];

  const streamEncoded = Stream.fromAsyncIterable(query, identity).pipe(
    Stream.orDie,
  );

  const stream: ConfectOrderedQueryFunction<"stream"> = () =>
    pipe(streamEncoded, Stream.mapEffect(decode(tableName, tableSchema)));

  const unique: ConfectOrderedQueryFunction<"unique"> = () =>
    pipe(
      stream(),
      Stream.take(2),
      Stream.runCollect,
      Effect.andThen((chunk) =>
        Option.match(Chunk.get(chunk, 1), {
          onSome: (doc) =>
            new DocumentNotUniqueError({
              id: (doc as GenericConfectDocumentWithSystemFields)._id,
              tableName,
            }),
          onNone: () =>
            Option.match(Chunk.get(chunk, 0), {
              onSome: decode(tableName, tableSchema),
              onNone: () =>
                Effect.fail(
                  new NoDocumentsMatchQueryError({
                    tableName,
                  }),
                ),
            }),
        }),
      ),
    );

  const first: ConfectOrderedQueryFunction<"first"> = () =>
    pipe(
      stream(),
      Stream.runHead,
      Effect.andThen(
        Option.match({
          onNone: () =>
            Effect.fail(new NoDocumentsMatchQueryError({ tableName })),
          onSome: decode(tableName, tableSchema),
        }),
      ),
    );

  const take: ConfectOrderedQueryFunction<"take"> = (n: number) =>
    pipe(
      stream(),
      Stream.take(n),
      Stream.runCollect,
      Effect.map((chunk) => Chunk.toReadonlyArray(chunk)),
    );

  const collect: ConfectOrderedQueryFunction<"collect"> = () =>
    pipe(stream(), Stream.runCollect, Effect.map(Chunk.toReadonlyArray));

  const paginate: ConfectOrderedQueryFunction<"paginate"> =
    makePaginateFunction(
      (options) => query.paginate(options),
      decode(tableName, tableSchema),
    );

  return {
    first,
    unique,
    take,
    collect,
    stream,
    paginate,
  };
};

const encode = dual<
  <
    ConfectDataModel extends GenericConfectDataModel,
    TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
  >(
    tableName: TableName,
    tableSchema: TableSchemaFromConfectTableInfo<ConfectDataModel[TableName]>,
  ) => (
    self: ConfectDataModel[TableName]["confectDocument"],
  ) => Effect.Effect<
    ConfectDataModel[TableName]["encodedConfectDocument"],
    DocumentEncodeError
  >,
  <
    ConfectDataModel extends GenericConfectDataModel,
    TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
  >(
    self: ConfectDataModel[TableName]["confectDocument"],
    tableName: TableName,
    tableSchema: TableSchemaFromConfectTableInfo<ConfectDataModel[TableName]>,
  ) => Effect.Effect<
    ConfectDataModel[TableName]["encodedConfectDocument"],
    DocumentEncodeError
  >
>(
  3,
  <
    ConfectDataModel extends GenericConfectDataModel,
    TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
  >(
    self: ConfectDataModel[TableName]["confectDocument"],
    tableName: TableName,
    tableSchema: TableSchemaFromConfectTableInfo<ConfectDataModel[TableName]>,
  ): Effect.Effect<
    ConfectDataModel[TableName]["encodedConfectDocument"],
    DocumentEncodeError
  > =>
    Effect.gen(function* () {
      const TableSchemaWithSystemFields = extendWithSystemFields(
        tableName,
        tableSchema,
      );

      const decodedDoc = self as (typeof TableSchemaWithSystemFields)["Type"];

      const encodedDoc = yield* pipe(
        decodedDoc,
        Schema.encode(tableSchema),
        Effect.catchTag("ParseError", (parseError) =>
          Effect.gen(function* () {
            const formattedParseError =
              yield* ParseResult.ArrayFormatter.formatError(parseError);

            return yield* new DocumentEncodeError({
              tableName,
              id: decodedDoc._id,
              parseError: formattedParseError,
            });
          }),
        ),
      );

      return encodedDoc;
    }),
);

const decode = dual<
  <
    ConfectDataModel extends GenericConfectDataModel,
    TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
  >(
    tableName: TableName,
    tableSchema: TableSchemaFromConfectTableInfo<ConfectDataModel[TableName]>,
  ) => (
    self: ConfectDataModel[TableName]["convexDocument"],
  ) => Effect.Effect<
    ConfectDataModel[TableName]["confectDocument"],
    DocumentDecodeError
  >,
  <
    ConfectDataModel extends GenericConfectDataModel,
    TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
  >(
    self: ConfectDataModel[TableName]["convexDocument"],
    tableName: TableName,
    tableSchema: TableSchemaFromConfectTableInfo<ConfectDataModel[TableName]>,
  ) => Effect.Effect<
    ConfectDataModel[TableName]["confectDocument"],
    DocumentDecodeError
  >
>(
  3,
  <
    ConfectDataModel extends GenericConfectDataModel,
    TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
  >(
    self: ConfectDataModel[TableName]["convexDocument"],
    tableName: TableName,
    tableSchema: TableSchemaFromConfectTableInfo<ConfectDataModel[TableName]>,
  ): Effect.Effect<
    ConfectDataModel[TableName]["confectDocument"],
    DocumentDecodeError
  > =>
    Effect.gen(function* () {
      const TableSchemaWithSystemFields = extendWithSystemFields(
        tableName,
        tableSchema,
      );

      const encodedDoc =
        self as (typeof TableSchemaWithSystemFields)["Encoded"];

      const decodedDoc = yield* pipe(
        encodedDoc,
        Schema.decode(TableSchemaWithSystemFields),
        Effect.catchTag("ParseError", (parseError) =>
          Effect.gen(function* () {
            const formattedParseError =
              yield* ParseResult.ArrayFormatter.formatError(parseError);

            return yield* new DocumentDecodeError({
              tableName,
              id: encodedDoc._id,
              parseError: formattedParseError,
            });
          }),
        ),
      );

      return decodedDoc;
    }),
);

export class DocumentNotFoundError extends Schema.TaggedError<DocumentNotFoundError>(
  "DocumentNotFoundError",
)("DocumentNotFoundError", {
  id: Schema.String,
  tableName: Schema.String,
}) {
  override get message(): string {
    return documentQueryMessage({
      id: this.id,
      tableName: this.tableName,
      message: "not found",
    });
  }
}

export class DocumentEncodeError extends Schema.TaggedError<DocumentEncodeError>(
  "DocumentEncodeError",
)("DocumentEncodeError", {
  tableName: Schema.String,
  id: Schema.String,
  parseError: Schema.Array(Schema.ArrayFormatterIssue),
}) {
  override get message(): string {
    return documentQueryMessage({
      id: this.id,
      tableName: this.tableName,
      message: `could not be encoded:\n\n  ${this.parseError}`,
    });
  }
}

export class DocumentDecodeError extends Schema.TaggedError<DocumentDecodeError>(
  "DocumentDecodeError",
)("DocumentDecodeError", {
  tableName: Schema.String,
  id: Schema.String,
  parseError: Schema.Array(Schema.ArrayFormatterIssue),
}) {
  override get message(): string {
    return documentQueryMessage({
      id: this.id,
      tableName: this.tableName,
      message: `could not be decoded:\n\n  ${this.parseError}`,
    });
  }
}

const documentQueryMessage = ({
  id,
  tableName,
  message,
}: {
  id: string;
  tableName: string;
  message: string;
}) => `Document with ID '${id}' in table '${tableName}' ${message}`;

const makePaginateFunction =
  <
    ConfectDocument extends GenericConfectDocument,
    ConvexDocument extends GenericDocument,
  >(
    getPaginationResult: (options: {
      cursor: string | null;
      numItems: number;
    }) => Promise<PaginationResult<ConvexDocument>>,
    decodeDocument: (
      doc: ConvexDocument,
    ) => Effect.Effect<ConfectDocument, DocumentDecodeError>,
  ) =>
  (options: { cursor: string | null; numItems: number }) =>
    Effect.gen(function* () {
      const paginationResult = yield* Effect.promise(() =>
        getPaginationResult(options),
      );

      const parsedPage = yield* Effect.forEach(
        paginationResult.page,
        decodeDocument,
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

// Would prefer to use `BaseDatabaseReader` from the `convex` package, but it's not exported.
type BaseDatabaseReader<DataModel extends GenericDataModel> = {
  get: GenericDatabaseReader<DataModel>["get"];
  query: GenericDatabaseReader<DataModel>["query"];
};
