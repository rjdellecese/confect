import * as IdScope from "@confect/core/IdScope";
import { identity } from "effect/Function";
import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type { GenericDataModel, TableNamesInDataModel } from "convex/server";
import type * as Table from "./Table";

/**
 * @internal
 */
export const TypeId = "~@confect/server/DatabaseSchema";
/**
 * @internal
 */
export type TypeId = typeof TypeId;

export interface AppTarget {
  readonly kind: "app";
  readonly scope: IdScope.App;
}

export const appTarget: AppTarget = { kind: "app", scope: IdScope.app };

export interface ComponentTarget<
  Scope_ extends IdScope.IdScope = IdScope.IdScope,
> {
  readonly kind: "component";
  readonly scope: Scope_;
}

export type Target = AppTarget | ComponentTarget;

export type TargetArgs<Target_ extends Target> =
  | [target: Target_]
  | (AppTarget extends Target_ ? [target?: undefined] : never);

export class InvalidDatabaseTargetError extends Schema.TaggedError<
  InvalidDatabaseTargetError,
  {}
>()("InvalidDatabaseTargetError", {
  kind: Schema.String,
  scope: Schema.String,
}) {
  override get message(): string {
    return this.kind === "app"
      ? "An application database schema requires the application ID scope."
      : "A component database schema requires a nonempty ID scope.";
  }
}

const validateTarget = <Target_ extends Target>(
  target: Target_,
): Result.Result<Target_, InvalidDatabaseTargetError> =>
  (target.kind === "app" && target.scope === IdScope.app) ||
  (target.kind === "component" && target.scope.length > 0)
    ? Result.succeed(target)
    : Result.fail(
        InvalidDatabaseTargetError.make({
          kind: target.kind,
          scope: target.scope,
        }),
      );

export const checkedTarget = <const Target_ extends Target>(
  target: Target_,
): Target_ => Result.getOrThrowWith(validateTarget(target), identity);

/**
 * @internal
 */
export interface Any {
  readonly [TypeId]: unknown;
}

/**
 * @internal
 */
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

/**
 * @internal
 */
export interface AnyWithProps extends DatabaseSchema<
  Readonly<Record<string, Table.AnyWithProps>>,
  Target
> {}

export type AnyApp = AnyWithProps & { readonly target: AppTarget };

export type Scope<DatabaseSchema_ extends AnyWithProps> =
  DatabaseSchema_["target"]["scope"];

/**
 * @internal
 */
export type FromConvexDataModel<
  Model extends GenericDataModel,
  Scope_ extends IdScope.IdScope = IdScope.App,
> = DatabaseSchema<
  {
    readonly [Name in TableNamesInDataModel<Model>]: Omit<
      Table.AnyWithProps,
      "tableName" | "scope"
    > & { readonly tableName: Name; readonly scope: Scope_ };
  },
  Scope_ extends IdScope.App ? AppTarget : ComponentTarget<Scope_>
>;

/**
 * @internal
 */
export type Tables<DatabaseSchema_ extends AnyWithProps> =
  DatabaseSchema_[TypeId][keyof DatabaseSchema_[TypeId]];

/**
 * The bound table record, without evaluating any table schemas.
 */
export const tables = <DatabaseSchema_ extends AnyWithProps>(
  self: DatabaseSchema_,
): DatabaseSchema_[TypeId] => self[TypeId];

/**
 * @internal
 */
export type TableNames<DatabaseSchema_ extends AnyWithProps> = Table.Name<
  Tables<DatabaseSchema_>
> &
  string;

/**
 * @internal
 */
export type SystemTableNames = Table.Name<Table.SystemTables>;

/**
 * @internal
 */
export type AllTableNames<DatabaseSchema_ extends AnyWithProps> =
  | TableNames<DatabaseSchema_>
  | SystemTableNames;

/**
 * @internal
 */
export type TableWithName<
  DatabaseSchema_ extends AnyWithProps,
  TableName extends TableNames<DatabaseSchema_>,
> = Extract<Tables<DatabaseSchema_>, { readonly tableName: TableName }>;

export class InvalidTableBindingError extends Schema.TaggedError<
  InvalidTableBindingError,
  {}
>()("InvalidTableBindingError", {
  recordKey: Schema.String,
  tableName: Schema.String,
  tableScope: Schema.String,
  targetScope: Schema.String,
}) {
  override get message(): string {
    return `Table '${this.recordKey}' must be bound to its database schema's name and ID scope.`;
  }
}

const validateTables = <
  TablesRecord extends Readonly<Record<string, Table.AnyWithProps>>,
>(
  tableRecord: TablesRecord,
  target: Target,
): Result.Result<TablesRecord, InvalidTableBindingError> => {
  for (const [name, table] of Record.toEntries(tableRecord)) {
    if (name !== table.tableName || table.scope !== target.scope) {
      return Result.fail(
        InvalidTableBindingError.make({
          recordKey: name,
          tableName: table.tableName,
          tableScope: table.scope,
          targetScope: target.scope,
        }),
      );
    }
  }
  return Result.succeed(tableRecord);
};

/**
 * Construct a database schema from its bound table record. The record's keys
 * must match their tables' names. Table schemas remain lazy; construction only
 * stores the record. The empty case is `make({})`.
 *
 * @internal
 */
export function make<
  const TablesRecord extends Readonly<Record<string, Table.AnyWithProps>>,
>(tableRecord: TablesRecord, target?: AppTarget): DatabaseSchema<TablesRecord>;
/**
 * @internal
 */
export function make<
  const TablesRecord extends Readonly<Record<string, Table.AnyWithProps>>,
  const Target_ extends Target,
>(
  tableRecord: TablesRecord,
  target: Target_,
): DatabaseSchema<TablesRecord, Target_>;
/**
 * @internal
 */
export function make<
  const TablesRecord extends Readonly<Record<string, Table.AnyWithProps>>,
>(
  tableRecord: TablesRecord,
  target?: Target,
): DatabaseSchema<TablesRecord, Target> {
  const resolvedTarget = checkedTarget(target ?? appTarget);
  return {
    [TypeId]: Result.getOrThrowWith(
      validateTables(tableRecord, resolvedTarget),
      identity,
    ),
    target: resolvedTarget,
  };
}
