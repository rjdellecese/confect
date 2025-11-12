import { Effect, Function, ParseResult, pipe, Schema } from "effect";
import type {
  GenericConfectDataModel,
  TableNamesInConfectDataModel,
  TableSchemaFromConfectTableInfo,
} from "./ConfectDataModel";
import * as SystemFields from "./SystemFields";

export const decode = Function.dual<
  <
    ConfectDataModel extends GenericConfectDataModel,
    TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
  >(
    tableName: TableName,
    tableSchema: TableSchemaFromConfectTableInfo<ConfectDataModel[TableName]>
  ) => (
    self: ConfectDataModel[TableName]["convexDocument"]
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
    tableSchema: TableSchemaFromConfectTableInfo<ConfectDataModel[TableName]>
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
    tableSchema: TableSchemaFromConfectTableInfo<ConfectDataModel[TableName]>
  ): Effect.Effect<
    ConfectDataModel[TableName]["confectDocument"],
    DocumentDecodeError
  > =>
    Effect.gen(function* () {
      const TableSchemaWithSystemFields = SystemFields.extendWithSystemFields(
        tableName,
        tableSchema
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
          })
        )
      );

      return decodedDoc;
    })
);

export const encode = Function.dual<
  <
    ConfectDataModel extends GenericConfectDataModel,
    TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
  >(
    tableName: TableName,
    tableSchema: TableSchemaFromConfectTableInfo<ConfectDataModel[TableName]>
  ) => (
    self: ConfectDataModel[TableName]["confectDocument"]
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
    tableSchema: TableSchemaFromConfectTableInfo<ConfectDataModel[TableName]>
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
    tableSchema: TableSchemaFromConfectTableInfo<ConfectDataModel[TableName]>
  ): Effect.Effect<
    ConfectDataModel[TableName]["encodedConfectDocument"],
    DocumentEncodeError
  > =>
    Effect.gen(function* () {
      type TableSchemaWithSystemFields = SystemFields.ExtendWithSystemFields<
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
          })
        )
      );

      return encodedDoc;
    })
);

export class DocumentDecodeError extends Schema.TaggedError<DocumentDecodeError>(
  "DocumentDecodeError"
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

export class DocumentEncodeError extends Schema.TaggedError<DocumentEncodeError>(
  "DocumentEncodeError"
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

export const documentErrorMessage = ({
  id,
  tableName,
  message,
}: {
  id: string;
  tableName: string;
  message: string;
}) => `Document with ID '${id}' in table '${tableName}' ${message}`;
