import type { ReadonlyValue } from "@confect/core/SchemaToValidator";
import { pipe } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Function from "effect/Function";
import * as Schema from "effect/Schema";
import type { ReadonlyRecord } from "effect/Record";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as DataModel from "./DataModel";
import type * as TableInfo from "./TableInfo";
import type * as Table from "./Table";

/**
 * Decoded document type for one application table, including `_id` and
 * `_creationTime`. Use the generated named types from `confect/_generated/docs`
 * when available, or select a table in an annotation such as `Document<typeof
 * schema, "notes">`.
 *
 * @category Models
 */
export type Document<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  TableName extends DatabaseSchema.TableNames<DatabaseSchema_>,
> = DataModel.DocumentByName<
  DataModel.FromDatabaseSchema<DatabaseSchema_>,
  TableName
>;

/**
 * Decoded user fields for an insert or a full replacement. This type omits
 * `_id` and `_creationTime` from each union member and preserves the
 * optionality of all other fields.
 *
 * @category Utility types
 */
export type WithoutSystemFields<Doc> = Doc extends unknown
  ? Omit<Doc, "_creationTime" | "_id">
  : never;

/**
 * @internal
 */
export type Any = any;
/**
 * @internal
 */
export type AnyEncoded = ReadonlyRecord<string, ReadonlyValue>;

/**
 * @internal
 */
export const decode = Function.dual<
  <Table_ extends Table.AnyWithProps>(
    table: Table_,
  ) => (
    self: TableInfo.TableInfo<Table_>["convexDocument"],
  ) => Effect.Effect<
    TableInfo.TableInfo<Table_>["document"],
    DocumentDecodeError
  >,
  <Table_ extends Table.AnyWithProps>(
    self: TableInfo.TableInfo<Table_>["convexDocument"],
    table: Table_,
  ) => Effect.Effect<
    TableInfo.TableInfo<Table_>["document"],
    DocumentDecodeError
  >
>(
  2,
  <Table_ extends Table.AnyWithProps>(
    self: TableInfo.TableInfo<Table_>["convexDocument"],
    table: Table_,
  ): Effect.Effect<
    TableInfo.TableInfo<Table_>["document"],
    DocumentDecodeError
  > =>
    pipe(
      self,
      Schema.decodeUnknownEffect(table.Doc),
      Effect.catchIf(Schema.isSchemaError, (schemaError) =>
        Effect.fail(
          DocumentDecodeError.make({
            tableName: table.tableName,
            id: self._id,
            parseError: schemaError.message,
          }),
        ),
      ),
    ),
);

/**
 * @internal
 */
export const encode = Function.dual<
  <Table_ extends Table.AnyWithProps>(
    table: Table_,
  ) => (
    self: Schema.Schema.Type<Table.Fields<Table_>>,
  ) => Effect.Effect<
    Schema.Codec.Encoded<Table.Fields<Table_>>,
    DocumentEncodeError
  >,
  <Table_ extends Table.AnyWithProps>(
    self: Schema.Schema.Type<Table.Fields<Table_>>,
    table: Table_,
  ) => Effect.Effect<
    Schema.Codec.Encoded<Table.Fields<Table_>>,
    DocumentEncodeError
  >
>(
  2,
  <Table_ extends Table.AnyWithProps>(
    self: Schema.Schema.Type<Table.Fields<Table_>>,
    table: Table_,
  ): Effect.Effect<
    Schema.Codec.Encoded<Table.Fields<Table_>>,
    DocumentEncodeError
  > =>
    pipe(
      self,
      Schema.encodeEffect(table.Fields),
      Effect.catchIf(Schema.isSchemaError, (schemaError) =>
        Effect.fail(
          DocumentEncodeError.make({
            tableName: table.tableName,
            id: self._id,
            parseError: schemaError.message,
          }),
        ),
      ),
    ),
);

/**
 * Typed failure from reading a stored document that its table's `Doc` codec
 * cannot decode. It identifies the table and document ID and carries the schema
 * diagnostic as text rather than the original document or `SchemaError`.
 *
 * @category Errors
 */
export class DocumentDecodeError extends Schema.TaggedError<
  DocumentDecodeError,
  {}
>()("DocumentDecodeError", {
  /**
   * Name of the table whose document codec rejected the stored value.
   *
   * @category Getters
   */
  tableName: Schema.String,
  /**
   * `_id` copied from the stored document.
   *
   * @category Getters
   */
  id: Schema.String,
  /**
   * Diagnostic message from the underlying schema error.
   *
   * @category Getters
   */
  parseError: Schema.String,
}) {
  /**
   * Returns the table, document ID, and decoding diagnostic in one message.
   *
   * @category Getters
   */
  override get message(): string {
    return documentErrorMessage({
      id: this.id,
      tableName: this.tableName,
      message: `could not be decoded:\n\n${this.parseError}`,
    });
  }
}

/**
 * Typed failure declared by writes when decoded user fields cannot be encoded
 * by the table's `Fields` codec. `parseError` contains the schema diagnostic as
 * text.
 *
 * **Gotchas**
 *
 * The error requires the input's `_id`. If encoding an insert or replacement
 * without `_id` fails, the effect dies while constructing this error instead of
 * returning it as a typed failure.
 *
 * @category Errors
 */
export class DocumentEncodeError extends Schema.TaggedError<
  DocumentEncodeError,
  {}
>()("DocumentEncodeError", {
  /**
   * Name of the table whose field codec rejected the decoded input.
   *
   * @category Getters
   */
  tableName: Schema.String,
  /**
   * `_id` copied from the input; required when constructing this error.
   *
   * @category Getters
   */
  id: Schema.String,
  /**
   * Diagnostic message from the underlying schema error.
   *
   * @category Getters
   */
  parseError: Schema.String,
}) {
  /**
   * Returns the table, input ID, and encoding diagnostic in one message.
   *
   * @category Getters
   */
  override get message(): string {
    return documentErrorMessage({
      id: this.id,
      tableName: this.tableName,
      message: `could not be encoded:\n\n${this.parseError}`,
    });
  }
}

/**
 * @internal
 */
export const documentErrorMessage = ({
  id,
  tableName,
  message,
}: {
  id: string;
  tableName: string;
  message: string;
}) => `Document with ID '${id}' in table '${tableName}' ${message}`;
