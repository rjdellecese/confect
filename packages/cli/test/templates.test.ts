import { fileURLToPath } from "node:url";
import * as templates from "@confect/cli/templates";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";

layer(NodeServices.layer)("id", (test) => {
  test.effect.each([{ tableNames: [] }, { tableNames: ["notes", "users"] }])(
    "exports matching ID types and schemas for $tableNames and system tables",
    ({ tableNames }) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner;
        const directory = yield* fs.makeTempDirectoryScoped({
          directory: import.meta.dirname,
          prefix: "id-",
        });
        const contents = yield* templates.id({ tableNames });
        expect(contents).toContain(
          'import type { SystemTableNames } from "convex/server";',
        );
        yield* fs.writeFileString(path.join(directory, "id.ts"), contents);
        yield* fs.writeFileString(
          path.join(directory, "consumer.ts"),
          `import { expectTypeOf } from "vitest";
import type { GenericId } from "convex/values";
import type { SystemTableNames } from "convex/server";
import { Id } from "./id";
import type { Id as IdType, TableNames } from "./id";

expectTypeOf<TableNames>().toEqualTypeOf<${tableNames.length === 0 ? "never" : tableNames.map((name) => `"${name}"`).join(" | ")}>();
expectTypeOf<Parameters<typeof Id>[0]>().toEqualTypeOf<TableNames | SystemTableNames>();
${[...tableNames, "_storage", "_scheduled_functions"]
  .map(
    (
      name,
    ) => `expectTypeOf<Id<"${name}">>().toEqualTypeOf<GenericId<"${name}">>();
expectTypeOf<IdType<"${name}">>().toEqualTypeOf<GenericId<"${name}">>();
expectTypeOf(Id("${name}").Type).toEqualTypeOf<Id<"${name}">>();
expectTypeOf(Id("${name}").Encoded).toEqualTypeOf<Id<"${name}">>();`,
  )
  .join("\n")}
// @ts-expect-error
Id("missing");
// @ts-expect-error
export type Missing = Id<"missing">;
// @ts-expect-error
export const wrongTable: Id<"_storage"> = "" as Id<"_scheduled_functions">;
// @ts-expect-error
export const plainString: Id<"_storage"> = "not-an-id";
`,
        );
        yield* fs.writeFileString(
          path.join(directory, "tsconfig.json"),
          `{
            "compilerOptions": {
              "strict": true,
              "noEmit": true,
              "skipLibCheck": true,
              "module": "ESNext",
              "moduleResolution": "Bundler",
              "target": "ESNext",
              "verbatimModuleSyntax": true
            },
            "include": ["*.ts"]
          }`,
        );
        const compiler = yield* spawner.spawn(
          ChildProcess.make(process.execPath, [
            fileURLToPath(
              new URL(
                "bin/tsc",
                import.meta.resolve("typescript/package.json"),
              ),
            ),
            "-p",
            directory,
          ]),
        );
        const output = yield* compiler.all.pipe(
          Stream.decodeText(),
          Stream.mkString,
        );
        expect(yield* compiler.exitCode, output).toBe(0);
      }).pipe(Effect.scoped),
    { timeout: 30000 },
  );
});

it.effect(
  "exports transaction control services as aliases of the server tags",
  () =>
    Effect.gen(function* () {
      const contents = yield* templates.services({
        schemaImportPath: "./schema",
      });
      for (const name of [
        "QueryTransactionContext",
        "MutationTransactionContext",
      ]) {
        expect(contents).toContain(`${name} as ${name}_,`);
        expect(contents).toContain(`export const ${name} = ${name}_.${name};`);
        expect(contents).toContain(
          `export type ${name} = typeof ${name}.Identifier;`,
        );
      }
    }),
);

it.effect("exports unified storage alongside compatible storage aliases", () =>
  Effect.gen(function* () {
    const contents = yield* templates.services({
      schemaImportPath: "./schema",
    });
    for (const name of [
      "Storage",
      "StorageReader",
      "StorageWriter",
      "StorageActionWriter",
    ]) {
      expect(contents).toContain(`${name} as ${name}_,`);
      expect(contents).toContain(`export const ${name} = ${name}_.${name};`);
      expect(contents).toContain(
        `export type ${name} = typeof ${name}.Identifier;`,
      );
    }
  }),
);

it.effect("exports metadata services as aliases of the server tags", () =>
  Effect.gen(function* () {
    const contents = yield* templates.services({
      schemaImportPath: "./schema",
    });

    for (const name of [
      "ExecutionMetadata",
      "RequestMetadata",
      "TransactionMetadata",
    ]) {
      expect(contents).toContain(`${name} as ${name}_,`);
      expect(contents).toContain(`export const ${name} = ${name}_.${name};`);
      expect(contents).toContain(
        `export type ${name} = typeof ${name}.Identifier;`,
      );
    }
  }),
);
