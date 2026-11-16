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

/**
 * The table name and table-typed ID returned together by `identify`.
 *
 * @category Models
 */
type IdentifiedId<Name extends string> = Name extends unknown
  ? { readonly table: Name; readonly id: GenericId<Name> }
  : never;

/**
 * Validate an untrusted string as a Convex document ID. Acquire the generated
 * `DocumentIds` service in queries, mutations, or middleware restricted to
 * those contexts. Actions and HTTP handlers can call a query to check an ID.
 *
 * Validation uses table names, not table handles or document reads. A valid ID
 * does not prove existence, authorization, or origin in this deployment. Native
 * runtime failures remain defects rather than returning `None`.
 *
 * @category Services
 *
 * @example
 *   import * as Effect from "effect/Effect";
 *   import { DocumentIds } from "./confect/_generated/services";
 *
 *   const parseNoteId = (input: string) =>
 *     Effect.gen(function* () {
 *       const ids = yield* DocumentIds;
 *       return yield* ids.parse("notes", input);
 *     });
 */
export interface DocumentIdsService<AppTableName extends string> {
  /**
   * Validate a string as an ID for one known table.
   *
   * @category Reading
   *
   * @param table - An application table name, `"_storage"`, or
   *   `"_scheduled_functions"`. Unlike `reader.table`, this takes a string, not
   *   a table handle.
   * @param input - The string to validate without modification.
   *
   * @returns An effect yielding `Some(id)` if Convex normalizes the input for
   *   this table to exactly the same string, or `None` otherwise.
   */
  readonly parse: <
    const Name extends AppTableName | DatabaseSchema.SystemTableNames,
  >(
    table: Name,
    input: string,
  ) => Effect.Effect<Option.Option<GenericId<Name>>>;
  /**
   * Identify which known table a current-format ID belongs to. Checks the
   * generated list of application table names, then the two system table names,
   * without loading application table codecs.
   *
   * @category Reading
   *
   * @param input - Untrusted ID string to check against application and system
   *   tables.
   *
   * @returns An effect yielding `Some({ table, id })` for the first matching
   *   table, or `None` when none matches. Both fields are readonly and
   *   correlated: narrowing `table` also narrows the ID's table type. This uses
   *   runtime ID lookups, not document scans, and cannot discover other
   *   components' tables.
   */
  readonly identify: (
    input: string,
  ) => Effect.Effect<
    Option.Option<IdentifiedId<AppTableName | DatabaseSchema.SystemTableNames>>
  >;
}

/**
 * The service requirement and shape for a particular database schema. Use the
 * generated `DocumentIds` tag to acquire the {@link DocumentIdsService}.
 *
 * @category Services
 */
export type DocumentIds<DatabaseSchema_ extends DatabaseSchema.AnyWithProps> =
  DocumentIdsService<DatabaseSchema.TableNames<DatabaseSchema_>>;

/**
 * @internal
 */
export type DocumentIdsTag<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> = Context.Service<DocumentIds<DatabaseSchema_>, DocumentIds<DatabaseSchema_>>;

const tag = <AppTableName extends string>() =>
  Context.Service<DocumentIdsService<AppTableName>>(
    "@confect/server/DocumentIds",
  );

/**
 * @internal
 */
export const DocumentIds = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
>(): DocumentIdsTag<DatabaseSchema_> =>
  tag<DatabaseSchema.TableNames<DatabaseSchema_>>();

type NativeReader<Name extends string> = Pick<
  GenericDatabaseReader<Record<Name, GenericTableInfo>>,
  "normalizeId" | "system"
>;

/**
 * @internal
 */
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

/**
 * @internal
 */
export const layer = <const AppTableName extends string>(
  tableNames: ReadonlyArray<AppTableName>,
  reader: NativeReader<NoInfer<AppTableName>>,
) => Layer.succeed(tag<AppTableName>(), make(tableNames, reader));
