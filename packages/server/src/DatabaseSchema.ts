import * as IdScope from "@confect/core/IdScope";
import * as Predicate from "effect/Predicate";
import type * as Table from "./Table";

export const TypeId = "~@confect/server/DatabaseSchema";
export type TypeId = typeof TypeId;

export interface AppTarget {
  readonly kind: "app";
  readonly scope: IdScope.App;
}

export interface ComponentTarget<
  Scope_ extends IdScope.IdScope = IdScope.IdScope,
> {
  readonly kind: "component";
  readonly scope: Scope_;
}

export type Target = AppTarget | ComponentTarget;

export interface Any {
  readonly [TypeId]: TypeId;
}

export const isDatabaseSchema = (u: unknown): u is Any =>
  Predicate.hasProperty(u, TypeId);

/**
 * A schema definition holding a record of bound `Table`s keyed by table
 * name. Codegen emits a single static `DatabaseSchema.make({ ... })` call;
 * laziness lives entirely on each `Table` (its `Fields` and `Doc` are lazy
 * memoised getters), so this layer is a plain
 * record indirection with no module-loading or async machinery.
 */
export interface DatabaseSchema<
  Tables_ extends Table.AnyWithProps = never,
  Target_ extends Target = AppTarget,
> {
  readonly [TypeId]: TypeId;
  readonly tables: {
    readonly [TableName in Table.Name<Tables_>]: Table.WithName<
      Tables_,
      TableName
    >;
  };
  readonly "~Tables": Tables_;
  readonly target: Target_;
}

export interface AnyWithProps {
  readonly [TypeId]: TypeId;
  readonly tables: Record<string, Table.AnyWithProps>;
  readonly "~Tables": Table.AnyWithProps;
  readonly target: Target;
}

export type Scope<Schema extends AnyWithProps> = Schema["target"]["scope"];

export type Tables<DatabaseSchema_ extends AnyWithProps> =
  DatabaseSchema_["~Tables"];

export type TableNames<DatabaseSchema_ extends AnyWithProps> = Table.Name<
  Tables<DatabaseSchema_>
> &
  string;

export type TableWithName<
  DatabaseSchema_ extends AnyWithProps,
  TableName extends TableNames<DatabaseSchema_>,
> = Extract<Tables<DatabaseSchema_>, { readonly tableName: TableName }>;

/**
 * Construct a `DatabaseSchema` from a record of bound `Table`s. The empty
 * case is `DatabaseSchema.make({})`. The `Tables_` union is inferred from
 * the value record's values, so codegen-emitted calls of the form
 * `DatabaseSchema.make({ notes, tags, users })` do not need an explicit
 * type argument.
 *
 * Invariant: each record **key must equal its value's `tableName`**. The
 * record is stored verbatim and later read by key (`databaseSchema.tables[
 * tableName]` in `DatabaseReader`/`DatabaseWriter`), so a key that diverges
 * from the bound table's name would make those lookups silently miss. The
 * type signature does not enforce this — codegen upholds it by deriving both
 * the key and the table name from the same filename (and the shorthand
 * `{ notes, tags, users }` form it emits makes them identical by
 * construction). Hand-written calls must preserve it.
 */
export const make = <
  const TablesRecord extends Record<string, Table.AnyWithProps>,
  const Target_ extends Target = AppTarget,
>(
  tables: TablesRecord,
  target?: Target_,
): DatabaseSchema<TablesRecord[keyof TablesRecord], Target_> => {
  const resolvedTarget = target ?? { kind: "app", scope: IdScope.app };
  if (resolvedTarget.kind === "component" && resolvedTarget.scope === "") {
    throw new Error(
      "A component database schema requires a nonempty ID scope.",
    );
  }
  for (const [name, table] of Object.entries(tables)) {
    if (name !== table.tableName || table.scope !== resolvedTarget.scope) {
      throw new Error(
        `Table '${name}' must be bound to its database schema's name and ID scope.`,
      );
    }
  }
  return {
    [TypeId]: TypeId,
    target: resolvedTarget,
    tables: tables as unknown as DatabaseSchema<
      TablesRecord[keyof TablesRecord]
    >["tables"],
  } as DatabaseSchema<TablesRecord[keyof TablesRecord], Target_>;
};
