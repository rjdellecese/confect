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
 */
export type PatchValue<Doc> = {
  [
    K in keyof Doc as K extends "_id" | "_creationTime" ? never : K
  ]?: undefined extends Doc[K] ? Doc[K] | undefined : Doc[K];
};

export interface DatabaseWriterTableAccessor<
  DataModel_ extends DataModel.AnyWithProps,
  TableName extends DataModel.TableNames<DataModel_>,
  Doc = DocumentByName_<DataModel_, TableName>,
> {
  readonly insert: (
    document: Document.WithoutSystemFields<Doc>,
  ) => Effect.Effect<GenericId<TableName>, Document.DocumentEncodeError>;
  readonly patch: (
    id: GenericId<TableName>,
    patchedValues: PatchValue<Doc>,
  ) => Effect.Effect<
    void,
    | QueryInitializer.GetByIdFailure
    | Document.DocumentDecodeError
    | Document.DocumentEncodeError
  >;
  readonly replace: (
    id: GenericId<TableName>,
    value: Document.WithoutSystemFields<Doc>,
  ) => Effect.Effect<void, Document.DocumentEncodeError>;
  readonly delete: (id: GenericId<TableName>) => Effect.Effect<void>;
}

/**
 * The service shape backing the `DatabaseWriter` tag. Named (rather than an
 * inferred anonymous object) so declaration emit prints
 * `DatabaseWriterService<…>` by reference instead of expanding the data model.
 * `Docs` is the optional named document registry (see
 * `DatabaseReaderService`).
 */
export interface DatabaseWriterService<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
> {
  readonly table: <T extends DatabaseSchema.Tables<DatabaseSchema_>>(
    table: T & {
      readonly tableName: Exclude<
        Table.Name<T>,
        DatabaseSchema.SystemTableNames
      >;
    },
  ) => T extends unknown
    ? DatabaseWriterTableAccessor<
        DataModel.FromTables<T>,
        Table.Name<T>,
        Table.Name<T> extends keyof Docs
          ? Docs[Table.Name<T>]
          : DocumentByName_<DataModel.FromTables<T>, Table.Name<T>>
      >
    : never;
}

/**
 * The tag's _Identifier_ is `Docs`-independent (see `DatabaseReaderTag`); only
 * the _Service_ carries `Docs` so writer inputs print the named doc
 * interfaces.
 */
export type DatabaseWriterTag<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
> = Context.Service<
  DatabaseWriterService<DatabaseSchema_>,
  DatabaseWriterService<DatabaseSchema_, Docs>
>;

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

export const DatabaseWriter = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
>(): DatabaseWriterTag<DatabaseSchema_, Docs> =>
  Context.Service<
    DatabaseWriterService<DatabaseSchema_>,
    DatabaseWriterService<DatabaseSchema_, Docs>
  >("@confect/server/DatabaseWriter");

export type DatabaseWriter<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> = DatabaseWriterService<DatabaseSchema_>;

export const layer = <DatabaseSchema_ extends DatabaseSchema.AnyWithProps>(
  convexDatabaseWriter: GenericDatabaseWriter<
    DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<DatabaseSchema_>>
  >,
) =>
  Layer.succeed(DatabaseWriter<DatabaseSchema_>(), make(convexDatabaseWriter));
