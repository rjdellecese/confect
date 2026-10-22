import * as StaticBindings from "@confect/cli/StaticBindings";
import * as OutputPlan from "@confect/cli/OutputPlan";
import * as templates from "@confect/cli/templates";
import * as DocName from "@confect/cli/DocName";
import type { TableModule } from "@confect/cli/TableModule";
import * as NodePath from "@effect/platform-node/NodePath";
import { assert, expect, expectTypeOf, layer } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

for (const platform of [
  { name: "POSIX", layer: NodePath.layerPosix },
  { name: "Windows", layer: NodePath.layerWin32 },
]) {
  layer(platform.layer)(`StaticBindings on ${platform.name}`, (it) => {
    it.effect.each([
      [],
      ["DatabaseSchema", "Table", "defineSchema", "user_profiles", "camelCase"],
    ])("renders unchanged bindings for %j using only path services", (names) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const tables: ReadonlyArray<TableModule> = Array.map(
          names,
          (tableName) => ({
            tableName,
            relativePath: path.join("tables", "nested", `${tableName}.ts`),
          }),
        );
        const encode = Schema.encodeEffect(
          Schema.fromJsonString(Schema.Unknown),
        );
        const before = yield* encode(tables);
        const rendered = StaticBindings.renderPlan(tables);
        expectTypeOf(rendered).toEqualTypeOf<
          Effect.Effect<OutputPlan.OutputPlan, OutputPlan.PlanError, Path.Path>
        >();
        const plan = yield* rendered;
        const bindings = Array.map(names, (tableName) => ({
          tableName,
          importPath: `./tables/${tableName}`,
        }));
        const wrappers = yield* Effect.forEach(names, (tableName) =>
          templates
            .tableWrapper({
              tableName,
              unnamedImportPath: `../../tables/nested/${tableName}`,
            })
            .pipe(
              Effect.map((contents) =>
                OutputPlan.Operation.Write({
                  target: OutputPlan.Target.TableWrapper({
                    relativePath: `${tableName}.ts`,
                  }),
                  contents,
                }),
              ),
            ),
        );
        expect(plan.operations).toEqual([
          OutputPlan.Operation.Write({
            target: OutputPlan.Target.Binding({ relativePath: "id.ts" }),
            contents: yield* templates.id({ tableNames: names }),
          }),
          ...wrappers,
          OutputPlan.Operation.Write({
            target: OutputPlan.Target.Binding({ relativePath: "schema.ts" }),
            contents: yield* templates.runtimeSchema({
              tableModules: bindings,
            }),
          }),
          OutputPlan.Operation.Write({
            target: OutputPlan.Target.Binding({
              relativePath: "convexSchema.ts",
            }),
            contents: yield* templates.convexSchema({ tableModules: bindings }),
          }),
          OutputPlan.Operation.Write({
            target: OutputPlan.Target.Binding({ relativePath: "docs.ts" }),
            contents: yield* templates.docs({
              schemaImportPath: "./schema",
              tables: Array.map(names, (tableName) => ({
                tableName,
                docName: DocName.fromTableName(tableName),
              })),
            }),
          }),
          OutputPlan.Operation.Write({
            target: OutputPlan.Target.Binding({ relativePath: "services.ts" }),
            contents: yield* templates.services({
              schemaImportPath: "./schema",
            }),
          }),
        ]);
        expect(yield* encode(tables)).toBe(before);
        expect((yield* rendered).operations).toEqual(plan.operations);
        const contents = Object.fromEntries(
          Array.filterMap(plan.operations, (operation) =>
            operation._tag === "Write"
              ? Result.succeed([
                  operation.target.relativePath,
                  operation.contents,
                ] as const)
              : Result.fail(undefined),
          ),
        );
        expect(contents["schema.ts"]).not.toContain("convex/server");
        expect(contents["schema.ts"]).not.toContain("tableDefinition");
        expect(contents["schema.ts"]).not.toContain(".Doc");
        expect(contents["convexSchema.ts"]).toContain('from "convex/server"');
        expect(contents["id.ts"]).toContain(
          names.length === 0
            ? "TableNames = never"
            : '"user_profiles" | "camelCase"',
        );
        if (names.length > 0) {
          expect(contents["schema.ts"]).toContain(
            "DatabaseSchema as $DatabaseSchema",
          );
          expect(contents["convexSchema.ts"]).toContain("Table as $Table");
          expect(contents["docs.ts"]).toContain(
            'export type UserProfilesDoc = Document.Document<typeof schemaDefinition, "user_profiles">;',
          );
          expect(contents["docs.ts"]).toContain("camelCase: CamelCaseDoc;");
        }
      }),
    );

    it.effect("rejects duplicate table destinations before publication", () =>
      Effect.gen(function* () {
        const table = { tableName: "notes", relativePath: "tables/notes.ts" };
        const result = yield* StaticBindings.renderPlan([table, table]).pipe(
          Effect.result,
        );
        assert(Result.isFailure(result));
        expect(result.failure).toMatchObject({
          namespace: "TableWrapper",
          relativePath: "notes.ts",
          reason: "ConflictingTarget",
        });
      }),
    );
  });
}
