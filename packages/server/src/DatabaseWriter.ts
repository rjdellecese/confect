import type {
  DocumentByName,
  GenericDatabaseWriter,
  GenericDataModel,
  TableNamesInDataModel,
  WithOptionalSystemFields,
  WithoutSystemFields,
} from "convex/server";
import type { GenericId } from "convex/values";
import type { BaseDatabaseReader } from "@confect/core/Types";
import { pipe } from "effect/Function";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Record from "effect/Record";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as DataModel from "./DataModel";
import type { DocumentByName as DocumentByName_ } from "./DataModel";
import * as Document from "./Document";
import * as QueryInitializer from "./QueryInitializer";
import type * as Table from "./Table";

/**
 * Partial update to a document's decoded user fields. Omit a field to leave it
 * unchanged, or set an optional field to `undefined` to remove it. `_id` and
 * `_creationTime` cannot be patched.
 *
 * @category Utility types
 */
export type PatchValue<Doc> = {
  [
    K in keyof Doc as K extends "_id" | "_creationTime" ? never : K
  ]?: undefined extends Doc[K] ? Doc[K] | undefined : Doc[K];
};

/**
 * Write operations for the application table selected by
 * `DatabaseWriterService.table`. They accept decoded user fields and use the
 * table's codec to produce the stored values. Native database failures are
 * defects.
 *
 * @category Models
 */
export interface DatabaseWriterTableAccessor<
  DataModel_ extends DataModel.AnyWithProps,
  TableName extends DataModel.TableNames<DataModel_>,
  Doc = DocumentByName_<DataModel_, TableName>,
> {
  /**
   * Encodes the user fields and inserts a document into the selected table.
   *
   * **Gotchas**
   *
   * The signature declares `DocumentEncodeError`, but constructing that error
   * requires an input `_id`. If encoding fails on the usual input without
   * `_id`, the effect dies instead.
   *
   * @category Writing
   *
   * @param document - Decoded user fields without `_id` or `_creationTime`.
   *
   * @returns An effect yielding the new table-typed ID. Its declared failure
   *   type is `DocumentEncodeError`.
   */
  readonly insert: (
    document: Document.WithoutSystemFields<Doc>,
  ) => Effect.Effect<GenericId<TableName>, Document.DocumentEncodeError>;
  /**
   * Reads the document, applies the patch to its decoded fields, and writes the
   * encoded result in the same mutation.
   *
   * **Details**
   *
   * The merge is shallow: supplying a nested object replaces it. Omitted fields
   * remain unchanged; `undefined` removes an optional field.
   *
   * @category Writing
   *
   * @param id - ID of the existing document.
   * @param patchedValues - Changed decoded user fields, without system fields.
   *
   * @returns An effect completing with void. Missing documents fail with
   *   `GetByIdFailure`; reading or encoding can fail with `DocumentDecodeError`
   *   or `DocumentEncodeError`. Native database failures remain defects.
   *
   * @see {@link DatabaseWriterTableAccessor.replace} for a full replacement.
   */
  readonly patch: (
    id: GenericId<TableName>,
    patchedValues: PatchValue<Doc>,
  ) => Effect.Effect<
    void,
    | QueryInitializer.GetByIdFailure
    | Document.DocumentDecodeError
    | Document.DocumentEncodeError
  >;
  /**
   * Replaces every user field with the encoded replacement, preserving `_id`
   * and `_creationTime` without decoding the original document.
   *
   * **Gotchas**
   *
   * A missing target is a native database defect, not `GetByIdFailure`. If
   * encoding fails on input without `_id`, constructing `DocumentEncodeError`
   * also produces a defect.
   *
   * @category Writing
   *
   * @param id - ID of the document to replace.
   * @param value - Complete replacement in decoded form, without system fields.
   *
   * @returns An effect completing with `void`, with `DocumentEncodeError` in
   *   the declared error channel.
   *
   * @see {@link DatabaseWriterTableAccessor.patch} to update only selected fields.
   */
  readonly replace: (
    id: GenericId<TableName>,
    value: Document.WithoutSystemFields<Doc>,
  ) => Effect.Effect<void, Document.DocumentEncodeError>;
  /**
   * Deletes the document with the supplied ID from the selected table.
   *
   * @category Writing
   *
   * @param id - Table-typed document ID.
   *
   * @returns An effect completing with void. There is no typed failure channel;
   *   native database failures are defects.
   */
  readonly delete: (id: GenericId<TableName>) => Effect.Effect<void>;
}

/**
 * Service for writing decoded documents in a mutation. Yield the generated
 * `DatabaseWriter` tag and select a bound application table to use its field
 * codec. `Docs` optionally supplies the generated named document types.
 *
 * **Example** (Inserting a note with decoded fields)
 *
 * ```ts
 * import * as Effect from "effect/Effect";
 * import { DatabaseWriter } from "confect/_generated/services";
 * import notesTable from "confect/_generated/tables/notes";
 *
 * export const insertNote = Effect.gen(function* () {
 *   const writer = yield* DatabaseWriter;
 *   return yield* writer.table(notesTable).insert({ text: "First note" });
 * });
 * ```
 *
 * @category Services
 */
export interface DatabaseWriterService<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
> {
  /**
   * Selects an application table for writes without reading or changing any
   * documents.
   *
   * @category Writing
   *
   * @param table - The table's bound handle from `_generated/tables/<name>`.
   *   System table handles are read-only.
   *
   * @returns Write operations typed to the selected table's decoded fields and
   *   IDs.
   *
   * @see {@link DatabaseWriterTableAccessor} for the operations on the selected table.
   */
  readonly table: <Table_ extends DatabaseSchema.Tables<DatabaseSchema_>>(
    table: Table_ & {
      readonly tableName: Exclude<
        Table.Name<Table_>,
        DatabaseSchema.SystemTableNames
      >;
    },
  ) => Table_ extends unknown
    ? DatabaseWriterTableAccessor<
        DataModel.FromTables<Table_>,
        Table.Name<Table_>,
        Table.Name<Table_> extends keyof Docs
          ? Docs[Table.Name<Table_>]
          : DocumentByName_<DataModel.FromTables<Table_>, Table.Name<Table_>>
      >
    : never;
}

/**
 * The tag's _Identifier_ is `Docs`-independent (see `DatabaseReaderTag`); only
 * the _Service_ carries `Docs` so writer inputs print the named doc
 * interfaces.
 *
 * @internal
 */
export type DatabaseWriterTag<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
> = Context.Service<
  DatabaseWriterService<DatabaseSchema_>,
  DatabaseWriterService<DatabaseSchema_, Docs>
>;

/**
 * @internal
 */
export const make = <Model extends GenericDataModel>(
  convexDatabaseWriter: GenericDatabaseWriter<Model>,
): DatabaseWriterService<DatabaseSchema.FromConvexDataModel<Model>> => {
  const reader: BaseDatabaseReader<any> = convexDatabaseWriter;
  const table = <TableName extends TableNamesInDataModel<Model>>(
    tableDef: Table.AnyWithProps & { readonly tableName: TableName },
  ) => {
    const tableName = tableDef.tableName;
    type Encoded = DocumentByName<Model, TableName>;

    const insert = Effect.fn("DatabaseWriter.insert")(function* (
      document: Record<string, unknown>,
    ) {
      const encodedDocument = yield* Document.encode(document, tableDef);

      const id = yield* Effect.promise(() =>
        convexDatabaseWriter.insert(
          tableName,
          encodedDocument as WithoutSystemFields<Encoded>,
        ),
      );

      return id;
    });

    const patch = Effect.fn("DatabaseWriter.patch")(function* (
      id: GenericId<TableName>,
      patchedValues: Record<string, unknown>,
    ) {
      const originalDecodedDoc = yield* QueryInitializer.getById<
        Table.AnyWithProps,
        TableName
      >(
        reader,
        tableDef,
      )(id);

      const updatedEncodedDoc = yield* pipe(
        patchedValues,
        Record.reduce(originalDecodedDoc, (acc, value, key) =>
          value === undefined
            ? Record.remove(acc, key)
            : Record.set(acc, key, value),
        ),
        Document.encode(tableDef),
      );

      yield* Effect.promise(() =>
        convexDatabaseWriter.replace(
          id,
          updatedEncodedDoc as WithOptionalSystemFields<Encoded>,
        ),
      );
    });

    const replace = Effect.fn("DatabaseWriter.replace")(function* (
      id: GenericId<TableName>,
      value: Record<string, unknown>,
    ) {
      const updatedEncodedDoc = yield* Document.encode(value, tableDef);

      yield* Effect.promise(() =>
        convexDatabaseWriter.replace(
          id,
          updatedEncodedDoc as WithOptionalSystemFields<Encoded>,
        ),
      );
    });

    const delete_ = (id: GenericId<TableName>) =>
      Effect.promise(() => convexDatabaseWriter.delete(id));

    return {
      insert,
      patch,
      replace,
      delete: delete_,
    };
  };

  return {
    table,
  } as DatabaseWriterService<DatabaseSchema.FromConvexDataModel<Model>>;
};

/**
 * @internal
 */
export const DatabaseWriter = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
>(): DatabaseWriterTag<DatabaseSchema_, Docs> =>
  Context.Service<
    DatabaseWriterService<DatabaseSchema_>,
    DatabaseWriterService<DatabaseSchema_, Docs>
  >("@confect/server/DatabaseWriter");

/**
 * Service requirement for effects that write to this database schema. Yield the
 * generated `DatabaseWriter` tag to acquire a {@link DatabaseWriterService} with
 * the application's named document types.
 *
 * @category Services
 */
export type DatabaseWriter<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> = DatabaseWriterService<DatabaseSchema_>;

/**
 * @internal
 */
export const layer = <DatabaseSchema_ extends DatabaseSchema.AnyWithProps>(
  convexDatabaseWriter: GenericDatabaseWriter<
    DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<DatabaseSchema_>>
  >,
) =>
  Layer.succeed(DatabaseWriter<DatabaseSchema_>(), make(convexDatabaseWriter));
