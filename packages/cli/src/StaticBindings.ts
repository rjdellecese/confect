import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as DocName from "./DocName";
import * as OutputPlan from "./OutputPlan";
import type { TableModule } from "./TableModule";
import * as templates from "./templates";
import { toModuleImportPath } from "./utils";

export const renderPlan = Effect.fn("StaticBindings.renderPlan")(function* (
  tables: ReadonlyArray<TableModule>,
) {
  const path = yield* Path.Path;
  const bindings = Array.map(tables, ({ tableName }) => ({
    tableName,
    importPath: `./tables/${tableName}`,
  }));
  const wrappers = yield* Effect.forEach(
    tables,
    Effect.fnUntraced(function* (table) {
      const unnamedImportPath = yield* toModuleImportPath(
        path.relative(path.join("_generated", "tables"), table.relativePath),
      );
      return OutputPlan.Operation.Write({
        target: OutputPlan.Target.TableWrapper({
          relativePath: `${table.tableName}.ts`,
        }),
        contents: yield* templates.tableWrapper({
          tableName: table.tableName,
          unnamedImportPath,
        }),
      });
    }),
  );
  return yield* Effect.fromResult(
    OutputPlan.make([
      OutputPlan.Operation.Write({
        target: OutputPlan.Target.Binding({ relativePath: "id.ts" }),
        contents: yield* templates.id({
          tableNames: Array.map(tables, ({ tableName }) => tableName),
        }),
      }),
      ...wrappers,
      OutputPlan.Operation.Write({
        target: OutputPlan.Target.Binding({ relativePath: "schema.ts" }),
        contents: yield* templates.runtimeSchema({ tableModules: bindings }),
      }),
      OutputPlan.Operation.Write({
        target: OutputPlan.Target.Binding({ relativePath: "convexSchema.ts" }),
        contents: yield* templates.convexSchema({ tableModules: bindings }),
      }),
      OutputPlan.Operation.Write({
        target: OutputPlan.Target.Binding({ relativePath: "docs.ts" }),
        contents: yield* templates.docs({
          schemaImportPath: "./schema",
          tables: Array.map(tables, ({ tableName }) => ({
            tableName,
            docName: DocName.fromTableName(tableName),
          })),
        }),
      }),
      OutputPlan.Operation.Write({
        target: OutputPlan.Target.Binding({ relativePath: "services.ts" }),
        contents: yield* templates.services({ schemaImportPath: "./schema" }),
      }),
    ]),
  );
});
