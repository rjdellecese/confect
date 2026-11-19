import type { GenericDatabaseReader, GenericTableInfo } from "convex/server";
import type { GenericId } from "convex/values";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Iterable from "effect/Iterable";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Record from "effect/Record";
import * as Struct from "effect/Struct";
import type * as DatabaseSchema from "./DatabaseSchema";
import * as Table from "./Table";

type IdentifiedId<Name extends string> = Name extends unknown
  ? { readonly table: Name; readonly id: GenericId<Name> }
  : never;

export interface DocumentIdsService<AppTableName extends string> {
  readonly parse: <
    const Name extends AppTableName | DatabaseSchema.SystemTableNames,
  >(
    table: Name,
    input: string,
  ) => Effect.Effect<Option.Option<GenericId<Name>>>;
  readonly identify: (
    input: string,
  ) => Effect.Effect<
    Option.Option<IdentifiedId<AppTableName | DatabaseSchema.SystemTableNames>>
  >;
}

export type DocumentIds<DatabaseSchema_ extends DatabaseSchema.AnyWithProps> =
  DocumentIdsService<DatabaseSchema.TableNames<DatabaseSchema_>>;

export type DocumentIdsTag<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> = Context.Service<DocumentIds<DatabaseSchema_>, DocumentIds<DatabaseSchema_>>;

const tag = <AppTableName extends string>() =>
  Context.Service<DocumentIdsService<AppTableName>>(
    "@confect/server/DocumentIds",
  );

export const DocumentIds = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
>(): DocumentIdsTag<DatabaseSchema_> =>
  tag<DatabaseSchema.TableNames<DatabaseSchema_>>();

type NativeReader<Name extends string> = Pick<
  GenericDatabaseReader<Record<Name, GenericTableInfo>>,
  "normalizeId" | "system"
>;

export const make = <const AppTableName extends string>(
  tableNames: ReadonlyArray<AppTableName>,
  reader: NativeReader<NoInfer<AppTableName>>,
): DocumentIdsService<AppTableName> => {
  type AllTableNames = AppTableName | DatabaseSchema.SystemTableNames;
  const normalize = <Name extends AllTableNames>(
    table: Name,
    input: string,
  ): GenericId<Name> | null =>
    (Record.has<string, unknown>(Table.systemTables, table)
      ? reader.system.normalizeId(
          table as DatabaseSchema.SystemTableNames,
          input,
        )
      : reader.normalizeId(
          table as AppTableName,
          input,
        )) as GenericId<Name> | null;

  return {
    parse: Effect.fn("DocumentIds.parse")(
      <const Name extends AllTableNames>(table: Name, input: string) =>
        Effect.sync(() => {
          const id = normalize(table, input);
          return id === input ? Option.some(id) : Option.none();
        }),
    ),
    identify: Effect.fn("DocumentIds.identify")((input: string) =>
      Effect.sync(() => {
        for (const table of Iterable.appendAll(
          tableNames,
          Struct.keys(Table.systemTables),
        )) {
          const id = normalize(table, input);
          if (id === input) {
            return Option.some({ table, id } as IdentifiedId<AllTableNames>);
          }
        }
        return Option.none();
      }),
    ),
  };
};

export const layer = <const AppTableName extends string>(
  tableNames: ReadonlyArray<AppTableName>,
  reader: NativeReader<NoInfer<AppTableName>>,
) => Layer.succeed(tag<AppTableName>(), make(tableNames, reader));
