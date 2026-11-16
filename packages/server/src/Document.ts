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
 * The decoded document type for a table in a database schema, including `_id`
 * and `_creationTime`. Prefer the generated named aliases in
 * `confect/_generated/docs` when available; this helper also supports inline
 * annotations such as `Document<typeof schema, "notes">`.
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
 * Remove `_id` and `_creationTime` from a decoded document type. Distributes
 * over unions and preserves all user fields, including their optionality. Use
 * it for complete insert or replacement values, not partial patches.
 *
 * @category Models
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
 * A stored document failed decoding through its table's `Doc` codec. Database
 * reads expose this as a typed Effect/Stream failure. The payload identifies
 * the table and stored ID and contains the schema diagnostic text; it does not
 * carry the original document or a SchemaError object.
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
   * Human-readable diagnostic including the table, ID, and decoding failure.
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
 * Decoded user fields failed encoding through a table's `Fields` codec.
 * Database writer signatures include this typed failure before writing.
 * `parseError` contains the schema diagnostic text, not a SchemaError object.
 *
 * Current limitation: error construction requires the input's `_id`. If an
 * insert or replacement input lacks it, encoding failure instead becomes a
 * schema-validation defect while constructing this error.
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
   * Human-readable diagnostic including the table, input ID, and encoding
   * failure.
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
