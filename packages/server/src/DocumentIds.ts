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
 * Service for checking untrusted ID strings against application and system
 * table names without reading documents. Yield the generated `DocumentIds` tag
 * in a query, mutation, or middleware restricted to those contexts. Actions and
 * HTTP handlers can call a query to check an ID.
 *
 * **Gotchas**
 *
 * A valid ID does not prove the document exists, the caller can read it, or it
 * came from this deployment. Native runtime failures are defects, not `None`.
 *
 * **Example** (Checking an untrusted note ID)
 *
 * ```ts
 * import * as Effect from "effect/Effect";
 * import { DocumentIds } from "confect/_generated/services";
 *
 * export const parseNoteId = (input: string) =>
 *   Effect.gen(function* () {
 *     const ids = yield* DocumentIds;
 *     return yield* ids.parse("notes", input);
 *   });
 * ```
 *
 * @remarks
 *   Codegen support: this interface names the generated service shape; do not
 *   import it directly. Yield `DocumentIds` from `confect/_generated/services`
 *   and call `ids.parse` or `ids.identify`.
 *
 * @category Services
 */
export interface DocumentIdsService<AppTableName extends string> {
  /**
   * Checks whether the input is already a current-format ID for the named
   * table. A string that would normalize to a different ID is not accepted.
   *
   * @category Decoding
   *
   * @param table - An application table name, `"_storage"`, or
   *   `"_scheduled_functions"`. Unlike `reader.table`, this takes a string, not
   *   a table handle.
   * @param input - The string to validate without modification.
   *
   * @returns An effect yielding `Some(id)` if Convex normalizes the input for
   *   this table to exactly the same string, or `None` otherwise.
   *
   * @see `ids.identify` when the table name is unknown.
   */
  readonly parse: <
    const Name extends AppTableName | DatabaseSchema.SystemTableNames,
  >(
    table: Name,
    input: string,
  ) => Effect.Effect<Option.Option<GenericId<Name>>>;
  /**
   * Identifies the first known table for which the input is a current-format
   * ID. It checks the application's generated table names, then the system
   * tables, without loading codecs or fetching documents.
   *
   * @category Decoding
   *
   * @param input - Untrusted ID string to check against application and system
   *   tables.
   *
   * @returns An effect yielding `Some({ table, id })` for the first matching
   *   table, or `None` when none matches. Both fields are readonly and
   *   correlated: narrowing `table` also narrows the ID's table type. This uses
   *   runtime ID lookups, not document scans, and cannot discover other
   *   components' tables.
   *
   * @see `ids.parse` when the table name is known.
   */
  readonly identify: (
    input: string,
  ) => Effect.Effect<
    Option.Option<IdentifiedId<AppTableName | DatabaseSchema.SystemTableNames>>
  >;
}

/**
 * Service requirement for validating IDs against the tables of a particular
 * database schema. Import the `DocumentIds` type from
 * `confect/_generated/services` to describe that requirement for your
 * application.
 *
 * @category Services
 */
export type DocumentIds<DatabaseSchema_ extends DatabaseSchema.AnyWithProps> =
  DocumentIdsService<DatabaseSchema.TableNames<DatabaseSchema_>>;

/**
 * Annotates the generated `DocumentIds` tag. For an Effect requirement, import
 * the type `DocumentIds` from `confect/_generated/services` instead of naming
 * this tag type.
 *
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
 * Constructs the schema-specific tag for generated services. Import
 * `DocumentIds` from `confect/_generated/services` and yield it rather than
 * calling this factory.
 *
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

const isSystemTable = (name: string): name is DatabaseSchema.SystemTableNames =>
  Record.has<string, unknown>(Table.systemTables, name);

/**
 * @internal
 */
export const make = <const AppTableName extends string>(
  tableNames: ReadonlyArray<AppTableName>,
  reader: NativeReader<NoInfer<AppTableName>>,
): DocumentIdsService<AppTableName> => {
  type AllTableNames = AppTableName | DatabaseSchema.SystemTableNames;
  const normalize = (table: AllTableNames, input: string) =>
    isSystemTable(table)
      ? reader.system.normalizeId(table, input)
      : reader.normalizeId(table, input);
  const isIdForTable = <Name extends AllTableNames>(
    table: Name,
    input: string,
  ): input is GenericId<Name> => normalize(table, input) === input;

  return {
    parse: Effect.fn("DocumentIds.parse")(
      <const Name extends AllTableNames>(table: Name, input: string) =>
        Effect.sync(() =>
          isIdForTable(table, input) ? Option.some(input) : Option.none(),
        ),
    ),
    identify: Effect.fn("DocumentIds.identify")((input: string) =>
      Effect.sync(() => {
        for (const table of Iterable.appendAll(
          tableNames,
          Struct.keys(Table.systemTables),
        )) {
          if (isIdForTable(table, input)) {
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- identify returns a discriminated union: the preceding successful check brands this very ID with this very table, a correlation the loop cannot express.
            return Option.some({
              table,
              id: input,
            } as IdentifiedId<AllTableNames>);
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
