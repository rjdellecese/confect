import * as Predicate from "effect/Predicate";
import type * as Table from "./Table";

export const TypeId = "~@confect/server/DatabaseSchema";
export type TypeId = typeof TypeId;

export interface Any {
  readonly [TypeId]: unknown;
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
  Tables_ extends Readonly<Record<string, Table.AnyWithProps>> = {},
> {
  readonly [TypeId]: Readonly<Tables_>;
}

export interface AnyWithProps extends DatabaseSchema<
  Readonly<Record<string, Table.AnyWithProps>>
> {}

export type Tables<DatabaseSchema_ extends AnyWithProps> =
  DatabaseSchema_[TypeId][keyof DatabaseSchema_[TypeId]];

/** The bound table record, without evaluating any table schemas. */
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
 * must match their tables' names. Table schemas remain lazy; construction
 * only stores the record. The empty case is `make({})`.
 */
export const make = <
  const TablesRecord extends Readonly<Record<string, Table.AnyWithProps>>,
>(
  tableRecord: TablesRecord,
): DatabaseSchema<TablesRecord> => ({ [TypeId]: tableRecord });
