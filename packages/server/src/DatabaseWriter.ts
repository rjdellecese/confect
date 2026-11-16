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
 * The argument accepted by `patch`: like `Partial<Doc>` without system fields,
 * but the fields that are already optional also accept `undefined`, since
 * setting a field to `undefined` unsets it.
 *
 * @category Models
 */
export type PatchValue<Doc> = {
  [
    K in keyof Doc as K extends "_id" | "_creationTime" ? never : K
  ]?: undefined extends Doc[K] ? Doc[K] | undefined : Doc[K];
};

/**
 * Writes to one application table, returned by `DatabaseWriterService.table`.
 * Inputs contain decoded user fields, not Convex's stored representation.
 * Signatures expose typed codec failures; native write failures are defects.
 * See DocumentEncodeError for the current limitation with inputs lacking
 * `_id`.
 *
 * @category Models
 */
export interface DatabaseWriterTableAccessor<
  DataModel_ extends DataModel.AnyWithProps,
  TableName extends DataModel.TableNames<DataModel_>,
  Doc = DocumentByName_<DataModel_, TableName>,
> {
  /**
   * Encode and insert a new document.
   *
   * @category Writing
   *
   * @param document - Decoded user fields without `_id` or `_creationTime`.
   *
   * @returns An effect yielding the new table-typed ID, or failing with
   *   `DocumentEncodeError` if the fields cannot be encoded. Current
   *   limitation: encoding failure on input without `_id` becomes a defect
   *   while constructing that error, rather than the declared typed failure.
   */
  readonly insert: (
    document: Document.WithoutSystemFields<Doc>,
  ) => Effect.Effect<GenericId<TableName>, Document.DocumentEncodeError>;
  /**
   * Read, shallowly merge, encode, and replace a document within the mutation.
   * Nested objects are replaced rather than recursively merged. Setting an
   * optional field to `undefined` removes it; omitted fields remain unchanged.
   *
   * @category Writing
   *
   * @param id - ID of the existing document.
   * @param patchedValues - Changed decoded user fields, without system fields.
   *
   * @returns An effect completing with void. Missing documents fail with
   *   `GetByIdFailure`; reading or encoding can fail with `DocumentDecodeError`
   *   or `DocumentEncodeError`. Native database failures remain defects.
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
   * Encode and replace all user fields, preserving Convex system fields.
   *
   * @category Writing
   *
   * @param id - ID of the document to replace.
   * @param value - Complete replacement in decoded form, without system fields.
   *
   * @returns An effect completing with void or failing with
   *   `DocumentEncodeError`. Native failures, including a missing target
   *   document, are defects rather than `GetByIdFailure`; this operation does
   *   not decode the old document. Current limitation: encoding failure without
   *   an input `_id` becomes a defect while constructing DocumentEncodeError.
   */
  readonly replace: (
    id: GenericId<TableName>,
    value: Document.WithoutSystemFields<Doc>,
  ) => Effect.Effect<void, Document.DocumentEncodeError>;
  /**
   * Delete a document through Convex's native database writer.
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
 * Write decoded documents through the generated `DatabaseWriter` service in a
 * mutation. The table handle supplies the codec for each write; `Docs`
 * optionally supplies the generated named document types.
 *
 * @category Services
 *
 * @example
 *   import * as Effect from "effect/Effect";
 *   import { DatabaseWriter } from "./confect/_generated/services";
 *   import notesTable from "./confect/_generated/tables/notes";
 *
 *   const insertNote = Effect.gen(function* () {
 *     const writer = yield* DatabaseWriter;
 *     return yield* writer.table(notesTable).insert({ text: "First note" });
 *   });
 */
export interface DatabaseWriterService<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
> {
  /**
   * Select an application table to insert, patch, replace, or delete documents.
   *
   * @category Writing
   *
   * @param table - The table's bound handle from `_generated/tables/<name>`.
   *   System table handles are read-only.
   *
   * @returns Write operations typed to the table's decoded fields and IDs.
   *   Selecting the handle does not read or write documents.
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
 * The writer service requirement and uncustomized shape for a schema. Use the
 * generated `DatabaseWriter` tag to acquire it; {@link DatabaseWriterService}
 * additionally accepts the generated named-document registry.
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
