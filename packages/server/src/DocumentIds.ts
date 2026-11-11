import type { GenericDatabaseReader } from "convex/server";
import type { GenericId } from "convex/values";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Record from "effect/Record";
import * as Struct from "effect/Struct";
import type * as DataModel from "./DataModel";
import * as DatabaseSchema from "./DatabaseSchema";
import * as Table from "./Table";

type IdentifiedId<TableName extends string> = {
  readonly [Name in TableName]: {
    readonly table: Name;
    readonly id: GenericId<Name>;
  };
}[TableName];

export interface DocumentIds<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> {
  readonly parse: <
    const Name extends DatabaseSchema.AllTableNames<DatabaseSchema_>,
  >(
    table: Name,
    input: string,
  ) => Effect.Effect<Option.Option<GenericId<Name>>>;
  readonly identify: (
    input: string,
  ) => Effect.Effect<
    Option.Option<IdentifiedId<DatabaseSchema.AllTableNames<DatabaseSchema_>>>
  >;
}

export type DocumentIdsTag<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> = Context.Service<DocumentIds<DatabaseSchema_>, DocumentIds<DatabaseSchema_>>;

export const DocumentIds = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
>(): DocumentIdsTag<DatabaseSchema_> =>
  Context.Service<DocumentIds<DatabaseSchema_>>("@confect/server/DocumentIds");

export const make = <DatabaseSchema_ extends DatabaseSchema.AnyWithProps>(
  schema: DatabaseSchema_,
  reader: GenericDatabaseReader<
    DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<DatabaseSchema_>>
  >,
): DocumentIds<DatabaseSchema_> => {
  const normalize = <
    Name extends DatabaseSchema.AllTableNames<DatabaseSchema_>,
  >(
    table: Name,
    input: string,
  ): GenericId<Name> | null =>
    (Record.has<string, unknown>(Table.systemTables, table)
      ? reader.system.normalizeId(
          table as DatabaseSchema.SystemTableNames,
          input,
        )
      : reader.normalizeId(
          table as DatabaseSchema.TableNames<DatabaseSchema_>,
          input,
        )) as GenericId<Name> | null;

  return {
    parse: Effect.fn("DocumentIds.parse")(
      <const Name extends DatabaseSchema.AllTableNames<DatabaseSchema_>>(
        table: Name,
        input: string,
      ) =>
        Effect.sync(() => {
          const id = normalize(table, input);
          return id === input ? Option.some(id) : Option.none();
        }),
    ),
    identify: Effect.fn("DocumentIds.identify")((input: string) =>
      Effect.sync(() => {
        const tables = [
          ...Struct.keys(DatabaseSchema.tables(schema)),
          ...Struct.keys(Table.systemTables),
        ] as ReadonlyArray<DatabaseSchema.AllTableNames<DatabaseSchema_>>;
        for (const table of tables) {
          const id = normalize(table, input);
          if (id === input) {
            return Option.some({ table, id } as IdentifiedId<
              DatabaseSchema.AllTableNames<DatabaseSchema_>
            >);
          }
        }
        return Option.none();
      }),
    ),
  };
};

export const layer = <DatabaseSchema_ extends DatabaseSchema.AnyWithProps>(
  schema: DatabaseSchema_,
  reader: GenericDatabaseReader<
    DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<DatabaseSchema_>>
  >,
) => Layer.succeed(DocumentIds<DatabaseSchema_>(), make(schema, reader));
