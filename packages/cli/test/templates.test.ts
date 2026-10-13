import { fileURLToPath } from "node:url";
import type { LeafModule } from "@confect/cli/LeafModule";
import { assemblyNodesFromLeaves } from "@confect/cli/SpecAssemblyNode";
import * as templates from "@confect/cli/templates";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it, layer } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";

const leafAt = (pathSegments: [string, ...string[]]): LeafModule => {
  const relativePath = `${pathSegments.join("/")}.spec.ts`;
  return {
    relativePath,
    pathSegments,
    groupPathDot: pathSegments.join("."),
    exportName: pathSegments[pathSegments.length - 1]!,
    runtime: Option.none(),
    specImportPath: `../${relativePath.slice(0, -".ts".length)}`,
  };
};

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

layer(NodeServices.layer)("assembledSpec", (test) => {
  test.effect(
    "typechecks with more groups than an inferred builder chain allows",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner;
        const directory = yield* fs.makeTempDirectoryScoped({
          directory: import.meta.dirname,
          prefix: "spec-",
        });
        // An inferred chain fails with TS2589 from 48 top-level groups, and
        // from about 90 children of one group.
        const names = (prefix: string, count: number) =>
          Array.makeBy(
            count,
            (index) => `${prefix}${String(index + 1).padStart(3, "0")}`,
          );
        const leaves: LeafModule[] = [
          ...names("g", 60).map((name) => leafAt([name])),
          ...names("c", 100).map((name) => leafAt(["nested", name])),
        ];
        const groupSpec = `import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";

export default GroupSpec.make().addFunction(
  FunctionSpec.publicQuery({ name: "get", returns: () => Schema.Null }),
);
`;
        yield* fs.makeDirectory(path.join(directory, "nested"));
        yield* fs.makeDirectory(path.join(directory, "_generated"));
        yield* Effect.forEach(leaves, (leaf) =>
          fs.writeFileString(
            path.join(directory, leaf.relativePath),
            groupSpec,
          ),
        );
        yield* fs.writeFileString(
          path.join(directory, "_generated", "spec.ts"),
          yield* templates.assembledSpec({
            nodes: assemblyNodesFromLeaves(leaves),
          }),
        );
        yield* fs.writeFileString(
          path.join(directory, "consumer.ts"),
          `import { Refs } from "@confect/core";
import spec from "./_generated/spec";

const refs = Refs.make(spec);

export const last = refs.public.g060.get;
export const nested = refs.public.nested.c100.get;
// @ts-expect-error
export const missing = refs.public.g061;
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
            "include": ["**/*.ts"]
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
    { timeout: 60000 },
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
