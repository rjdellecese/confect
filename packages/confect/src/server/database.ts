import type {
  BetterOmit,
  DocumentByInfo,
  DocumentByName,
  Expand,
  FieldTypeFromFieldPath,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericDataModel,
  GenericTableIndexes,
  Indexes,
  IndexRange,
  IndexRangeBuilder,
  NamedIndex,
  NamedSearchIndex,
  NamedTableInfo,
  OrderedQuery,
  PaginationResult,
  Query,
  QueryInitializer,
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
  Context,
  Effect,
  Either,
  Function,
  identity,
  Layer,
  type Option,
  ParseResult,
  pipe,
  Record,
  Schema,
  Stream,
  Struct,
} from "effect";
import type {
  ConfectDocumentByName,
  DataModelFromConfectDataModel,
  GenericConfectDataModel,
  GenericConfectTableInfo,
  TableInfoFromConfectTableInfo,
  TableNamesInConfectDataModel,
  TableSchemaFromConfectTableInfo,
} from "./data_model";
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
import {
  ExtendWithSystemFields,
  extendWithSystemFields,
} from "./schemas/SystemFields";

const makeConfectDatabaseReader = <
  ConfectSchemaDefinition extends GenericConfectSchemaDefinition,
>(
  confectSchemaDefinition: ConfectSchemaDefinition,
  convexDatabaseReader: GenericDatabaseReader<
    DataModelFromConfectDataModel<
      ConfectDataModelFromConfectSchema<
        ConfectSchemaDefinition["confectSchema"]
      >
    >
  >,
) => {
  type ConfectSchema = ConfectSchemaDefinition["confectSchema"];

  type ConfectSchemaWithSystemTables =
    ExtendWithConfectSystemSchema<ConfectSchema>;

  return {
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
  };
};

export const ConfectDatabaseReader = <
  ConfectSchemaDefinition extends GenericConfectSchemaDefinition,
>() =>
  Context.GenericTag<
    ReturnType<typeof makeConfectDatabaseReader<ConfectSchemaDefinition>>
  >("@rjdellecese/confect/ConfectDatabaseReader");

export const confectDatabaseReaderLayer = <
  ConfectSchemaDefinition extends GenericConfectSchemaDefinition,
>(
  confectSchemaDefinition: ConfectSchemaDefinition,
  convexDatabaseReader: GenericDatabaseReader<
    DataModelFromConfectDataModel<
      ConfectDataModelFromConfectSchema<
        ConfectSchemaDefinition["confectSchema"]
      >
    >
  >,
) =>
  Layer.succeed(
    ConfectDatabaseReader<ConfectSchemaDefinition>(),
    makeConfectDatabaseReader(confectSchemaDefinition, convexDatabaseReader),
  );

const makeConfectDatabaseWriter = <
  ConfectSchemaDefinition extends GenericConfectSchemaDefinition,
>(
  confectSchemaDefinition: ConfectSchemaDefinition,
  convexDatabaseWriter: GenericDatabaseWriter<
    DataModelFromConfectDataModel<
      ConfectDataModelFromConfectSchema<
        ConfectSchemaDefinition["confectSchema"]
      >
    >
  >,
) => {
  type ConfectDataModel =
    ConfectDataModelFromConfectSchemaDefinition<ConfectSchemaDefinition>;

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

export const ConfectDatabaseWriter = <
  ConfectSchemaDefinition extends GenericConfectSchemaDefinition,
>() =>
  Context.GenericTag<
    ReturnType<typeof makeConfectDatabaseWriter<ConfectSchemaDefinition>>
  >("@rjdellecese/confect/ConfectDatabaseWriter");

export const confectDatabaseWriterLayer = <
  ConfectSchemaDefinition extends GenericConfectSchemaDefinition,
>(
  confectSchemaDefinition: ConfectSchemaDefinition,
  convexDatabaseWriter: GenericDatabaseWriter<
    DataModelFromConfectDataModel<
      ConfectDataModelFromConfectSchema<
        ConfectSchemaDefinition["confectSchema"]
      >
    >
  >,
) =>
  Layer.succeed(
    ConfectDatabaseWriter<ConfectSchemaDefinition>(),
    makeConfectDatabaseWriter(confectSchemaDefinition, convexDatabaseWriter),
  );

// TODO: Put in type_utils.d.ts and test it
type IndexFieldTypesForEq<
  ConvexDataModel extends GenericDataModel,
  Table extends TableNamesInDataModel<ConvexDataModel>,
  T extends string[],
> = T extends readonly [...infer Rest, any]
  ? Rest extends readonly string[]
    ? {
        [K in keyof Rest]: FieldTypeFromFieldPath<
          DocumentByName<ConvexDataModel, Table>,
          Rest[K]
        >;
      }
    : never
  : never;

type ConfectQueryInitializer<
  ConfectDataModel extends GenericConfectDataModel,
  TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
> = {
  readonly get: {
    (
      id: GenericId<TableName>,
    ): Effect.Effect<
      ConfectDataModel[TableName]["confectDocument"],
      DocumentDecodeError | GetByIdFailure
    >;
    <
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
    ): Effect.Effect<
      ConfectDataModel[TableName]["confectDocument"],
      DocumentDecodeError | GetByIndexFailure
    >;
  };
  readonly index: {
    <
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
      order?: "asc" | "desc",
    ): ConfectOrderedQuery<ConfectDataModel[TableName], TableName>;
    <
      IndexName extends keyof Indexes<
        TableInfoFromConfectTableInfo<ConfectDataModel[TableName]>
      >,
    >(
      indexName: IndexName,
      order?: "asc" | "desc",
    ): ConfectOrderedQuery<ConfectDataModel[TableName], TableName>;
  };
  readonly search: <
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
  tableName: TableName,
  convexDatabaseReader: BaseDatabaseReader<ConvexDataModel>,
  confectTableDefinition: ConfectSchema[TableName],
): ConfectQueryInitializer<ConfectDataModel, TableName> => {
  type ThisConfectQueryInitializer = ConfectQueryInitializer<
    ConfectDataModel,
    TableName
  >;
  type ConfectQueryFunction<
    FunctionName extends keyof ThisConfectQueryInitializer,
  > = ThisConfectQueryInitializer[FunctionName];

  const getByIndex = <
    IndexName extends keyof Indexes<
      TableInfoFromConfectTableInfo<ConfectDataModel[TableName]>
    >,
  >(
    indexName: IndexName,
    indexFieldValues: IndexFieldTypesForEq<
      DataModelFromConfectDataModel<ConfectDataModel>,
      TableName,
      Indexes<
        TableInfoFromConfectTableInfo<ConfectDataModel[TableName]>
      >[IndexName]
    >,
  ): Effect.Effect<
    ConfectDataModel[TableName]["confectDocument"],
    DocumentDecodeError | GetByIndexFailure
  > => {
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
          () =>
            new GetByIndexFailure({
              tableName,
              indexName: indexName as string,
              indexFieldValues: indexFieldValues as string[],
            }),
        ),
      ),
      Effect.andThen(decode(tableName, confectTableDefinition.tableSchema)),
    );
  };

  const get: ConfectQueryFunction<"get"> = ((
    ...args: Parameters<ConfectQueryFunction<"get">>
  ) => {
    if (args.length === 1) {
      const id = args[0] as GenericId<TableName>;

      return getById(
        tableName,
        convexDatabaseReader,
        confectTableDefinition,
      )(id);
    } else {
      const [indexName, ...indexFieldValues] = args;

      return getByIndex(
        indexName as keyof Indexes<
          TableInfoFromConfectTableInfo<ConfectDataModel[TableName]>
        >,
        indexFieldValues,
      );
    }
  }) as ConfectQueryFunction<"get">;

  const index: ConfectQueryFunction<"index"> = <
    IndexName extends keyof Indexes<
      TableInfoFromConfectTableInfo<ConfectDataModel[TableName]>
    >,
  >(
    indexName: IndexName,
    indexRangeOrOrder?:
      | ((
          q: IndexRangeBuilder<
            ConfectDataModel[TableName]["convexDocument"],
            NamedIndex<
              TableInfoFromConfectTableInfo<ConfectDataModel[TableName]>,
              IndexName
            >
          >,
        ) => IndexRange)
      | "asc"
      | "desc",
    order?: "asc" | "desc",
  ) => {
    const {
      applyWithIndex,
      applyOrder,
    }: {
      applyWithIndex: (
        queryInitializer: QueryInitializer<
          NamedTableInfo<ConvexDataModel, TableName>
        >,
      ) => Query<NamedTableInfo<ConvexDataModel, TableName>>;
      applyOrder: (
        query: Query<NamedTableInfo<ConvexDataModel, TableName>>,
      ) => OrderedQuery<NamedTableInfo<ConvexDataModel, TableName>>;
    } =
      indexRangeOrOrder === undefined
        ? {
            applyWithIndex: (q) => q.withIndex(indexName),
            applyOrder: (q) => q.order("asc"),
          }
        : typeof indexRangeOrOrder === "function"
          ? order === undefined
            ? {
                applyWithIndex: (q) =>
                  q.withIndex(indexName, indexRangeOrOrder),
                applyOrder: (q) => q.order("asc"),
              }
            : {
                applyWithIndex: (q) =>
                  q.withIndex(indexName, indexRangeOrOrder),
                applyOrder: (q) => q.order(order),
              }
          : {
              applyWithIndex: (q) => q.withIndex(indexName),
              applyOrder: (q) => q.order(indexRangeOrOrder),
            };

    const orderedQuery = pipe(
      convexDatabaseReader.query(tableName),
      applyWithIndex,
      applyOrder,
    );

    return makeConfectOrderedQuery<ConfectDataModel[TableName], TableName>(
      orderedQuery,
      tableName,
      confectTableDefinition.tableSchema,
    );
  };

  const search: ConfectQueryFunction<"search"> = (indexName, searchFilter) =>
    makeConfectOrderedQuery<ConfectDataModel[TableName], TableName>(
      convexDatabaseReader
        .query(tableName)
        .withSearchIndex(indexName, searchFilter),
      tableName,
      confectTableDefinition.tableSchema,
    );

  return {
    get,
    index,
    search,
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
    convexDatabaseReader: BaseDatabaseReader<ConvexDataModel>,
    confectTableDefinition: ConfectSchema[TableName],
  ) =>
  (id: GenericId<TableName>) =>
    pipe(
      Effect.promise(() => convexDatabaseReader.get(id)),
      Effect.andThen(
        Either.fromNullable(() => new GetByIdFailure({ tableName, id })),
      ),
      Effect.andThen(decode(tableName, confectTableDefinition.tableSchema)),
    );

type ConfectOrderedQuery<
  ConfectTableInfo extends GenericConfectTableInfo,
  _TableName extends string,
> = {
  readonly first: () => Effect.Effect<
    Option.Option<ConfectTableInfo["confectDocument"]>,
    DocumentDecodeError
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
        decode(tableName, tableSchema),
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

/////////////////////////
// Encoding & Decoding //
/////////////////////////

const encode = Function.dual<
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
      type TableSchemaWithSystemFields = ExtendWithSystemFields<
        TableName,
        TableSchemaFromConfectTableInfo<ConfectDataModel[TableName]>
      >;

      const decodedDoc = self as TableSchemaWithSystemFields["Type"];

      const encodedDoc = yield* pipe(
        decodedDoc,
        Schema.encode(tableSchema),
        Effect.catchTag("ParseError", (parseError) =>
          Effect.gen(function* () {
            const formattedParseError =
              yield* ParseResult.TreeFormatter.formatError(parseError);

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

const decode = Function.dual<
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
              yield* ParseResult.TreeFormatter.formatError(parseError);

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

////////////
// Errors //
////////////

export class GetByIndexFailure extends Schema.TaggedError<GetByIndexFailure>(
  "GetByIndexFailure",
)("GetByIndexFailure", {
  tableName: Schema.String,
  indexName: Schema.String,
  indexFieldValues: Schema.Array(Schema.String),
}) {
  override get message(): string {
    return `No documents found in table '${this.tableName}' with index '${this.indexName}' and field values '${this.indexFieldValues}'`;
  }
}

export class GetByIdFailure extends Schema.TaggedError<GetByIdFailure>(
  "GetByIdFailure",
)("GetByIdFailure", {
  id: Schema.String,
  tableName: Schema.String,
}) {
  override get message(): string {
    return documentErrorMessage({
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
  parseError: Schema.String,
}) {
  override get message(): string {
    return documentErrorMessage({
      id: this.id,
      tableName: this.tableName,
      message: `could not be encoded:\n\n${this.parseError}`,
    });
  }
}

export class DocumentDecodeError extends Schema.TaggedError<DocumentDecodeError>(
  "DocumentDecodeError",
)("DocumentDecodeError", {
  tableName: Schema.String,
  id: Schema.String,
  parseError: Schema.String,
}) {
  override get message(): string {
    return documentErrorMessage({
      id: this.id,
      tableName: this.tableName,
      message: `could not be decoded:\n\n${this.parseError}`,
    });
  }
}

const documentErrorMessage = ({
  id,
  tableName,
  message,
}: {
  id: string;
  tableName: string;
  message: string;
}) => `Document with ID '${id}' in table '${tableName}' ${message}`;

// Would prefer to use `BaseDatabaseReader` from the `convex` package, but it's not exported.
type BaseDatabaseReader<DataModel extends GenericDataModel> = {
  get: GenericDatabaseReader<DataModel>["get"];
  query: GenericDatabaseReader<DataModel>["query"];
};
