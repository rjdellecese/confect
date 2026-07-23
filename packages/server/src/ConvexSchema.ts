import { defineSchema, type SchemaDefinition } from "convex/server";
import * as Effect from "effect/Effect";
import { runSyncThrowInIsolate } from "./internal/runSyncInIsolate";
import * as Table from "./Table";

export type TableDefinitions<
  Tables extends Record<string, Table.AnyWithProps>,
> = {
  [TableName in keyof Tables]: Tables[TableName]["tableDefinition"];
};

/**
 * Build the Convex deploy-time `SchemaDefinition` from a record of bound
 * Confect `Table`s, compiling every table's validator under a single
 * isolate-safe execution boundary — the one Effect run for a generated
 * `convexSchema.ts` module. Compile failures throw their tagged error at
 * module load.
 *
 * The record key must equal each table's `tableName` (the same invariant as
 * `DatabaseSchema.make`; codegen derives both from the filename).
 */
export const make = <const Tables extends Record<string, Table.AnyWithProps>>(
  tables: Tables,
): SchemaDefinition<TableDefinitions<Tables>, true> =>
  runSyncThrowInIsolate(
    Effect.map(
      Effect.forEach(Object.entries(tables), ([tableName, table]) =>
        Effect.map(
          Table.compileTableDefinition(table),
          (definition) => [tableName, definition] as const,
        ),
      ),
      (entries) => defineSchema(Object.fromEntries(entries)),
    ),
  ) as SchemaDefinition<TableDefinitions<Tables>, true>;
