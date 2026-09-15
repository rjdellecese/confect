import * as IdScope from "@confect/core/IdScope";
import * as Match from "effect/Match";
import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
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
  readonly [TypeId]: unknown;
}

export const isDatabaseSchema = (u: unknown): u is Any =>
  Predicate.hasProperty(u, TypeId);

/**
 * A schema definition holding a record of bound `Table`s keyed by table name.
 * Codegen emits a single static `DatabaseSchema.make({ ... })` call; laziness
 * lives entirely on each `Table` (its `Fields` and `Doc` are lazy memoised
 * getters), so this layer is a plain record indirection with no module-loading
 * or async machinery.
 */
export interface DatabaseSchema<
  Tables_ extends Readonly<Record<string, Table.AnyWithProps>> = {},
  Target_ extends Target = AppTarget,
> {
  readonly [TypeId]: Readonly<Tables_>;
  readonly target: Target_;
}

export interface AnyWithProps extends DatabaseSchema<
  Readonly<Record<string, Table.AnyWithProps>>,
  Target
> {}

export type Scope<Schema extends AnyWithProps> = Schema["target"]["scope"];

export type Tables<DatabaseSchema_ extends AnyWithProps> =
  DatabaseSchema_[TypeId][keyof DatabaseSchema_[TypeId]];

/**
 * The bound table record, without evaluating any table schemas.
 */
export const tables = <Schema extends AnyWithProps>(
  self: Schema,
): Schema[TypeId] => self[TypeId];

export type TableNames<DatabaseSchema_ extends AnyWithProps> = Table.Name<
  Tables<DatabaseSchema_>
> &
  string;

export type TableWithName<
  DatabaseSchema_ extends AnyWithProps,
  TableName extends TableNames<DatabaseSchema_>,
> = Extract<Tables<DatabaseSchema_>, { readonly tableName: TableName }>;

/**
 * Construct a database schema from its bound table record. The record's keys
 * must match their tables' names. Table schemas remain lazy; construction only
 * stores the record. The empty case is `make({})`.
 */
export const make = <
  const TablesRecord extends Readonly<Record<string, Table.AnyWithProps>>,
  const Target_ extends Target = AppTarget,
>(
  tableRecord: TablesRecord,
  target?: Target_,
): DatabaseSchema<TablesRecord, Target_> => {
  const resolvedTarget = target ?? { kind: "app", scope: IdScope.app };
  Match.value(resolvedTarget.kind).pipe(
    Match.when("app", () => {}),
    Match.when("component", () => {
      if (resolvedTarget.scope === "") {
        throw new Error(
          "A component database schema requires a nonempty ID scope.",
        );
      }
    }),
    Match.exhaustive,
  );
  for (const [name, table] of Record.toEntries(tableRecord)) {
    if (name !== table.tableName || table.scope !== resolvedTarget.scope) {
      throw new Error(
        `Table '${name}' must be bound to its database schema's name and ID scope.`,
      );
    }
  }
  return {
    [TypeId]: tableRecord,
    target: resolvedTarget,
  } as DatabaseSchema<TablesRecord, Target_>;
};
