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

/**
 * Types the default application target. Use the generated schema's `target`
 * property type to name its target.
 *
 * @internal
 */
export interface AppTarget {
  readonly kind: "app";
  readonly scope: IdScope.App;
}

/**
 * Supplies the default target for application registrations and
 * `HttpRouter.make`. A component instead exports its own `target` from
 * `_generated/id`.
 *
 * @internal
 */
export const appTarget: AppTarget = { kind: "app", scope: IdScope.app };

/**
 * Types the generated component target. Import `target` from the component's
 * `confect/_generated/id` rather than constructing it.
 *
 * @internal
 */
export interface ComponentTarget<
  Scope_ extends IdScope.IdScope = IdScope.IdScope,
> {
  readonly kind: "component";
  readonly scope: Scope_;
}

/**
 * Types the runtime descriptor used in registrations. Use the generated
 * schema's `target` property type to preserve its specific kind and scope.
 *
 * @internal
 */
export type Target = AppTarget | ComponentTarget;

/**
 * Types registration arguments so a component-specific schema requires an
 * explicit target. An omitted target always selects the application.
 *
 * @internal
 */
export type TargetArgs<Target_ extends Target> =
  | [target: Target_]
  | (AppTarget extends Target_ ? [target?: undefined] : never);

/**
 * Error raised when the target kind and ID scope disagree. An application
 * requires the empty app scope; a component requires a nonempty scope. The
 * error records the supplied `kind` and `scope`.
 *
 * @category Errors
 */
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

/**
 * Validates a target before registration. Use the component's generated
 * `target` or the application default rather than constructing a target.
 *
 * @internal
 */
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
 * Registry of the application or component's bound tables, default-exported
 * from `_generated/schema`. Each table's name matches its registry key, and its
 * ID scope matches the registry's target. Assembling the registry does not
 * evaluate table codecs or construct Convex deployment validators.
 *
 * **Gotchas**
 *
 * A value import loads every table module in the registry. Use `typeof schema`
 * with a type-only default import for annotations and import individual handles
 * from `_generated/tables/<name>` in handlers. `_generated/convexSchema`
 * supplies the separate Convex schema for deployment and test setup.
 *
 * @category Models
 */
export interface DatabaseSchema<
  Tables_ extends Readonly<Record<string, Table.AnyWithProps>> = {},
  Target_ extends Target = AppTarget,
> {
  readonly [TypeId]: Readonly<Tables_>;
  /**
   * Identifies the application or component that owns the tables. A component
   * also exports `target` from `_generated/id`, so passing the target to its
   * HTTP router does not require loading any table definitions.
   */
  readonly target: Target_;
}

/**
 * @internal
 */
export interface AnyWithProps extends DatabaseSchema<
  Readonly<Record<string, Table.AnyWithProps>>,
  Target
> {}

/**
 * Restricts application-only APIs to an app schema. Use `typeof schema` with a
 * type-only import from `confect/_generated/schema` for a specific schema.
 *
 * @internal
 */
export type AnyApp = AnyWithProps & { readonly target: AppTarget };

/**
 * Extracts the ID scope for generated service types. For the scope itself,
 * import `scope` from a component's `confect/_generated/id` or use the
 * application scope, `IdScope.app`.
 *
 * @internal
 */
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
 * Returns the registry's bound tables by name without evaluating their codecs.
 *
 * **When to use**
 *
 * Use when inspecting the handles for the application or component's own
 * tables. For a list of names alone, default-import `_generated/tableNames` to
 * avoid loading the table modules.
 *
 * @category Getters
 *
 * @param self - The registry from `_generated/schema`.
 *
 * @returns A readonly record keyed by table name. The system tables are not
 *   part of this record.
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

/**
 * Error raised when a table's bound name or ID scope does not match the
 * registry. Compare `recordKey` with `tableName` and `targetScope` with
 * `tableScope` to identify the mismatch.
 *
 * @category Errors
 */
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
 * Builds the application registry without evaluating table codecs. An omitted
 * target selects the application. Default-import `confect/_generated/schema`
 * rather than constructing a registry directly.
 *
 * @internal
 */
export function make<
  const TablesRecord extends Readonly<Record<string, Table.AnyWithProps>>,
>(tableRecord: TablesRecord, target?: AppTarget): DatabaseSchema<TablesRecord>;
/**
 * Builds the registry for an explicit target. A component requires its
 * generated target; default-import its registry from
 * `confect/_generated/schema`.
 *
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
