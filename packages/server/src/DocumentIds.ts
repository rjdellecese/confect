import type { GenericDatabaseReader } from "convex/server";
import type { GenericId } from "convex/values";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as DataModel from "./DataModel";
import * as DatabaseSchema from "./DatabaseSchema";
import * as Table from "./Table";

type TableNames<Schema extends DatabaseSchema.AnyWithProps> =
  | DatabaseSchema.TableNames<Schema>
  | Table.Name<Table.SystemTables>;

export type IdentifiedId<TableName extends string> = {
  readonly [Name in TableName]: {
    readonly table: Name;
    readonly id: GenericId<Name>;
  };
}[TableName];

export interface DocumentIds<Schema extends DatabaseSchema.AnyWithProps> {
  readonly parse: <const Name extends TableNames<Schema>>(
    table: Name,
    input: string,
  ) => Effect.Effect<Option.Option<GenericId<Name>>>;
  readonly identify: (
    input: string,
  ) => Effect.Effect<Option.Option<IdentifiedId<TableNames<Schema>>>>;
  readonly normalize: <const Name extends TableNames<Schema>>(
    table: Name,
    input: string,
  ) => Effect.Effect<Option.Option<GenericId<Name>>>;
}

export type DocumentIdsTag<Schema extends DatabaseSchema.AnyWithProps> =
  Context.Service<DocumentIds<Schema>, DocumentIds<Schema>>;

export const DocumentIds = <
  Schema extends DatabaseSchema.AnyWithProps,
>(): DocumentIdsTag<Schema> =>
  Context.Service<DocumentIds<Schema>>("@confect/server/DocumentIds");

type NativeReader<Schema extends DatabaseSchema.AnyWithProps> = Pick<
  GenericDatabaseReader<DataModel.ToConvex<DataModel.FromSchema<Schema>>>,
  "normalizeId"
> & {
  readonly system: Pick<
    GenericDatabaseReader<
      DataModel.ToConvex<DataModel.FromSchema<Schema>>
    >["system"],
    "normalizeId"
  >;
};

export const make = <Schema extends DatabaseSchema.AnyWithProps>(
  schema: Schema,
  reader: NativeReader<Schema>,
): DocumentIds<Schema> => {
  const normalize = <Name extends TableNames<Schema>>(
    table: Name,
    input: string,
  ): GenericId<Name> | null =>
    (Object.hasOwn(Table.systemTables, table)
      ? reader.system.normalizeId(
          table as Table.Name<Table.SystemTables>,
          input,
        )
      : reader.normalizeId(
          table as DatabaseSchema.TableNames<Schema>,
          input,
        )) as GenericId<Name> | null;

  return {
    parse: Effect.fn("DocumentIds.parse")(
      <const Name extends TableNames<Schema>>(table: Name, input: string) =>
        Effect.sync(() => {
          const id = normalize(table, input);
          return id === input ? Option.some(id) : Option.none();
        }),
    ),
    identify: Effect.fn("DocumentIds.identify")((input: string) =>
      Effect.sync(() => {
        const tables = [
          ...Object.keys(DatabaseSchema.tables(schema)),
          ...Object.keys(Table.systemTables),
        ] as ReadonlyArray<TableNames<Schema>>;
        for (const table of tables) {
          const id = normalize(table, input);
          if (id === input) {
            return Option.some({ table, id } as IdentifiedId<
              TableNames<Schema>
            >);
          }
        }
        return Option.none();
      }),
    ),
    normalize: Effect.fn("DocumentIds.normalize")(
      <const Name extends TableNames<Schema>>(table: Name, input: string) =>
        Effect.sync(() => Option.fromNullishOr(normalize(table, input))),
    ),
  };
};

export const layer = <Schema extends DatabaseSchema.AnyWithProps>(
  schema: Schema,
  reader: NativeReader<Schema>,
) => Layer.succeed(DocumentIds<Schema>(), make(schema, reader));
