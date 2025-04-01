import type {
  GenericDatabaseReader,
  Indexes,
  NamedIndex,
  IndexRangeBuilder,
  WithoutSystemFields,
  IndexRange,
  Query,
  OrderedQuery,
} from "convex/server";
import type { GenericId } from "convex/values";
import {
  Context,
  ParseResult,
  Effect,
  Either,
  Layer,
  pipe,
  Schema,
  Stream,
  identity,
  Function,
  Chunk,
  Option,
} from "effect";
import type {
  ConfectDocumentByName,
  DataModelFromConfectDataModel,
  GenericConfectDataModel,
  GenericConfectDocumentWithSystemFields,
  GenericConfectTableInfo,
  TableInfoFromConfectTableInfo,
  TableNamesInConfectDataModel,
  TableSchemaFromConfectTableInfo,
} from "./data-model";
import type {
  ConfectDataModelFromConfectSchemaDefinition,
  GenericConfectSchemaDefinition,
} from "./schema";
import { extendWithSystemFields } from "./schemas/SystemFields";

const makeConfectServices = <
  ConfectSchemaDefinition extends GenericConfectSchemaDefinition,
>(
  confectSchemaDefinition: ConfectSchemaDefinition,
) => {
  // Types
  type ConfectDataModel =
    ConfectDataModelFromConfectSchemaDefinition<ConfectSchemaDefinition>;
  type ConvexDataModel = DataModelFromConfectDataModel<ConfectDataModel>;

  // ConfectDatabaseSchemaDefinition
  const ConfectDatabaseSchemaDefinition = Context.GenericTag<{
    readonly self: ConfectSchemaDefinition;
  }>("@rjdellecese/confect/ConfectDatabaseSchemaDefinition");
  const ConfectDatabaseSchemaDefinitionLive = Layer.succeed(
    ConfectDatabaseSchemaDefinition,
    ConfectDatabaseSchemaDefinition.of({
      self: confectSchemaDefinition,
    }),
  );

  // ConvexDatabaseReader
  const ConvexDatabaseReader = Context.GenericTag<{
    readonly self: GenericDatabaseReader<ConvexDataModel>;
  }>("@rjdellecese/confect/ConvexDatabaseReader");
  const ConvexDatabaseReaderLive = (
    convexDatabaseReader: GenericDatabaseReader<ConvexDataModel>,
  ) =>
    Layer.succeed(
      ConvexDatabaseReader,
      ConvexDatabaseReader.of({
        self: convexDatabaseReader,
      }),
    );

  // ConfectDatabaseReader
  const ConfectDatabaseReader = Context.GenericTag<{
    readonly table: <
      TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
    >(
      tableName: TableName,
    ) => ConfectQueryInitializer<ConfectDataModel, TableName>;
  }>("@rjdellecese/confect/ConfectDatabaseReader");
  const ConfectDatabaseReaderLive = Layer.effect(
    ConfectDatabaseReader,
    Effect.gen(function* () {
      const confectDatabaseSchema = yield* ConfectDatabaseSchemaDefinition.pipe(
        Effect.map(({ self }) => self),
      );
      const convexDatabaseReader = yield* ConvexDatabaseReader.pipe(
        Effect.map(({ self }) => self),
      );

      return ConfectDatabaseReader.of({
        table: <
          TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
        >(
          tableName: TableName,
        ) =>
          makeConfectQueryInitializer<ConfectDataModel, TableName>(
            tableName,
            convexDatabaseReader,
            confectDatabaseSchema.confectSchema[tableName]?.tableSchema,
          ),
      });
    }),
  );

  return {
    ConfectDatabaseSchemaDefinition,
    ConfectDatabaseSchemaDefinitionLive,
    ConvexDatabaseReader,
    ConvexDatabaseReaderLive,
    ConfectDatabaseReader,
    ConfectDatabaseReaderLive,
  };
};

type ConfectQueryInitializer<
  ConfectDataModel extends GenericConfectDataModel,
  TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
> = {
  readonly getbyId: (
    id: GenericId<TableName>,
  ) => Effect.Effect<
    ConfectDataModel[TableName]["confectDocument"],
    DocumentNotFoundError | DocumentDecodeError
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
};

const makeConfectQueryInitializer = <
  ConfectDataModel extends GenericConfectDataModel,
  TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
>(
  tableName: TableName,
  convexDatabaseReader: GenericDatabaseReader<
    DataModelFromConfectDataModel<ConfectDataModel>
  >,
  tableSchema: TableSchemaFromConfectTableInfo<ConfectDataModel[TableName]>,
): ConfectQueryInitializer<ConfectDataModel, TableName> => {
  return {
    getbyId: (id) => {
      return pipe(
        Effect.promise(() => convexDatabaseReader.get(id)),
        Effect.andThen(
          Either.fromNullable(
            () => new DocumentNotFoundError({ tableName, id }),
          ),
        ),
        Effect.andThen(decode(tableName, tableSchema)),
      );
    },
    withIndex: (indexName, indexRange) =>
      makeConfectQuery<ConfectDataModel[TableName], TableName>(
        convexDatabaseReader.query(tableName).withIndex(indexName, indexRange),
        tableName,
        tableSchema,
      ),
  };
};

type ConfectQuery<
  ConfectTableInfo extends GenericConfectTableInfo,
  TableName extends string,
> = {
  order: (
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
  unique: Effect.Effect<
    ConfectTableInfo["confectDocument"],
    DocumentDecodeError | DocumentNotUniqueError | NoDocumentsMatchQueryError
  >;
  stream: Stream.Stream<ConfectTableInfo["confectDocument"]>;
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
      message: "is not unique",
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
  const stream = pipe(
    Stream.fromAsyncIterable(query, identity),
    Stream.mapEffect(decode(tableName, tableSchema)),
    Stream.orDie,
  );

  return {
    stream,
    // TODO: Add stream, use stream to implement
    unique: pipe(
      stream,
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
    ),
  };
};

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

class ConfectDatabaseWriter extends Effect.Tag(
  "@rjdellecese/confect/ConfectDatabaseWriter",
)<
  ConfectDatabaseWriter,
  {
    readonly insert: <
      TableName extends TableNamesInConfectDataModel<GenericConfectDataModel>,
    >(
      tableName: TableName,
      document: WithoutSystemFields<
        ConfectDocumentByName<GenericConfectDataModel, TableName>
      >,
    ) => Effect.Effect<GenericId<TableName>>;
  }
>() {}

const documentQueryMessage = ({
  id,
  tableName,
  message,
}: {
  id: string;
  tableName: string;
  message: string;
}) => `Document with ID '${id}' in table '${tableName}' ${message}`;

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
        Schema.decode(tableSchema),
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
