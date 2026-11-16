import type {
  BetterOmit,
  DocumentByName,
  Expand,
  GenericDatabaseWriter,
  WithoutSystemFields,
} from "convex/server";
import type { GenericId } from "convex/values";
import { pipe } from "effect/Function";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Record from "effect/Record";
import * as DatabaseSchema from "./DatabaseSchema";
import type * as DataModel from "./DataModel";
import type { DocumentByName as DocumentByName_ } from "./DataModel";
import * as Document from "./Document";
import * as QueryInitializer from "./QueryInitializer";
import type * as Table from "./Table";

/**
 * The argument accepted by `patch`: like `Partial<Doc>` without system fields,
 * but the fields that are already optional also accept `undefined`, since
 * setting a field to `undefined` unsets it.
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
 */
export interface DatabaseWriterTableAccessor<
  DataModel_ extends DataModel.AnyWithProps,
  TableName extends DataModel.TableNames<DataModel_>,
  Doc = DocumentByName_<DataModel_, TableName>,
> {
  /**
   * Encode and insert a new document.
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
   * @param id - Table-typed document ID.
   *
   * @returns An effect completing with void. There is no typed failure channel;
   *   native database failures are defects.
   */
  readonly delete: (id: GenericId<TableName>) => Effect.Effect<void>;
}

/**
 * The service shape backing the `DatabaseWriter` tag. Named (rather than an
 * inferred anonymous object) so declaration emit prints
 * `DatabaseWriterService<…>` by reference instead of expanding the data model.
 * `Docs` is the optional named document registry (see `DatabaseReaderService`).
 * Acquire it from the generated `DatabaseWriter` service inside a mutation.
 *
 * @example
 *   import * as Effect from "effect/Effect";
 *   import { DatabaseWriter } from "./confect/_generated/services";
 *
 *   const insertNote = Effect.gen(function* () {
 *     const writer = yield* DatabaseWriter;
 *     return yield* writer.table("notes").insert({ text: "First note" });
 *   });
 */
export interface DatabaseWriterService<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
> {
  /**
   * Select an application table for writes.
   *
   * @param tableName - A table declared in the schema; system tables are
   *   excluded.
   *
   * @returns Insert, patch, replace, and delete operations with decoded inputs.
   *   Selecting the table performs no database write.
   */
  readonly table: <
    const TableName extends DataModel.TableNames<
      DataModel.FromDatabaseSchema<DatabaseSchema_>
    >,
  >(
    tableName: TableName,
  ) => DatabaseWriterTableAccessor<
    DataModel.FromDatabaseSchema<DatabaseSchema_>,
    TableName,
    TableName extends keyof Docs
      ? Docs[TableName]
      : DocumentByName_<
          DataModel.FromDatabaseSchema<DatabaseSchema_>,
          TableName
        >
  >;
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
export const make = <DatabaseSchema_ extends DatabaseSchema.AnyWithProps>(
  databaseSchema: DatabaseSchema_,
  convexDatabaseWriter: GenericDatabaseWriter<
    DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<DatabaseSchema_>>
  >,
): DatabaseWriterService<DatabaseSchema_> => {
  type DataModel_ = DataModel.FromDatabaseSchema<DatabaseSchema_>;

  const table = <const TableName extends DataModel.TableNames<DataModel_>>(
    tableName: TableName,
  ) => {
    const tableDef = DatabaseSchema.tables(databaseSchema)[tableName];

    const insert = Effect.fn("DatabaseWriter.insert")(function* (
      document: Document.WithoutSystemFields<
        DocumentByName_<DataModel_, TableName>
      >,
    ) {
      const encodedDocument = yield* Document.encode(document, tableDef);

      const id = yield* Effect.promise(() =>
        convexDatabaseWriter.insert(
          tableName,
          encodedDocument as WithoutSystemFields<
            DocumentByName<DataModel.ToConvexDataModel<DataModel_>, TableName>
          >,
        ),
      );

      return id;
    });

    const patch = Effect.fn("DatabaseWriter.patch")(function* (
      id: GenericId<TableName>,
      patchedValues: PatchValue<DocumentByName_<DataModel_, TableName>>,
    ) {
      const originalDecodedDoc = yield* QueryInitializer.getById<
        Table.AnyWithProps,
        TableName
      >(
        convexDatabaseWriter as any,
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
          updatedEncodedDoc as Expand<
            BetterOmit<
              DocumentByName<
                DataModel.ToConvexDataModel<DataModel_>,
                TableName
              >,
              "_creationTime" | "_id"
            >
          >,
        ),
      );
    });

    const replace = Effect.fn("DatabaseWriter.replace")(function* (
      id: GenericId<TableName>,
      value: Document.WithoutSystemFields<
        DocumentByName_<DataModel_, TableName>
      >,
    ) {
      const updatedEncodedDoc = yield* Document.encode(value, tableDef);

      yield* Effect.promise(() =>
        convexDatabaseWriter.replace(
          id,
          updatedEncodedDoc as Expand<
            BetterOmit<
              DocumentByName<
                DataModel.ToConvexDataModel<DataModel_>,
                TableName
              >,
              "_creationTime" | "_id"
            >
          >,
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
  } as DatabaseWriterService<DatabaseSchema_>;
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
 */
export type DatabaseWriter<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> = DatabaseWriterService<DatabaseSchema_>;

/**
 * @internal
 */
export const layer = <DatabaseSchema_ extends DatabaseSchema.AnyWithProps>(
  databaseSchema: DatabaseSchema_,
  convexDatabaseWriter: GenericDatabaseWriter<
    DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<DatabaseSchema_>>
  >,
) =>
  Layer.succeed(
    DatabaseWriter<DatabaseSchema_>(),
    make(databaseSchema, convexDatabaseWriter),
  );
