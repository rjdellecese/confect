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
  test.effect.each([true, false])(
    "typechecks and emits precise declarations at scale with exactOptionalPropertyTypes=%s",
    (exactOptionalPropertyTypes) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner;
        const directory = yield* fs.makeTempDirectoryScoped({
          directory: import.meta.dirname,
          prefix: "spec-",
        });
        const names = (prefix: string, count: number) =>
          Array.makeBy(
            count,
            (index) => `${prefix}${String(index + 1).padStart(3, "0")}`,
          );
        const rootNames = names("g", 600);
        const childNames = names("c", 300);
        const deepNames = names("d", 100);
        const lastRoot = rootNames[rootNames.length - 1]!;
        const lastChild = childNames[childNames.length - 1]!;
        const lastDeep = deepNames[deepNames.length - 1]!;
        const leaves: LeafModule[] = [
          ...rootNames.map((name) => leafAt([name])),
          leafAt(["nested"]),
          ...childNames.map((name) => leafAt(["nested", name])),
          leafAt(["nested", lastChild, "level3"]),
          ...deepNames.map((name) =>
            leafAt(["nested", lastChild, "level3", "level4", name]),
          ),
          leafAt(["jobs"]),
        ];
        const groupSpec = `import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";

export default GroupSpec.make().addFunction(
  FunctionSpec.publicQuery({ name: "get", args: () => ({ id: Schema.String }), returns: () => Schema.String }),
);
`;
        yield* fs.makeDirectory(path.join(directory, "_generated"));
        yield* Effect.forEach(leaves, (leaf) =>
          Effect.gen(function* () {
            const target = path.join(directory, leaf.relativePath);
            yield* fs.makeDirectory(path.dirname(target), { recursive: true });
            yield* fs.writeFileString(
              target,
              leaf.exportName === "jobs"
                ? groupSpec
                    .replace("GroupSpec.make()", "GroupSpec.makeNode()")
                    .replace(
                      "FunctionSpec.publicQuery",
                      "FunctionSpec.internalNodeAction",
                    )
                : groupSpec,
            );
          }),
        );
        yield* fs.writeFileString(
          path.join(directory, "_generated", "spec.ts"),
          yield* templates.assembledSpec({
            nodes: assemblyNodesFromLeaves(leaves),
          }),
        );
        const consumer = `import { Refs, Spec } from "@confect/core";
import { expectTypeOf } from "vitest";
import spec from "./_generated/spec";

const refs = Refs.make(spec);

const last = refs.public.${lastRoot}.get;
const nested = refs.public.nested.${lastChild}.get;
const deep = refs.public.nested.${lastChild}.level3.level4.${lastDeep}.get;
const parent = refs.public.nested.get;
const middle = refs.public.nested.${lastChild}.level3.get;
const node = refs.internal.jobs.get;
expectTypeOf<keyof typeof refs.public>().toEqualTypeOf<${[...rootNames, "nested"].map((name) => `"${name}"`).join(" | ")}>();
expectTypeOf<keyof typeof refs.public.nested>().toEqualTypeOf<${[...childNames, "get"].map((name) => `"${name}"`).join(" | ")}>();
expectTypeOf(last["~Args"]).toEqualTypeOf<{ readonly id: string }>();
expectTypeOf(nested).toEqualTypeOf<typeof last>();
expectTypeOf(parent).toEqualTypeOf<typeof last>();
expectTypeOf(middle).toEqualTypeOf<typeof last>();
expectTypeOf(deep["~Returns"]).toEqualTypeOf<string>();
expectTypeOf(deep["~FunctionVisibility"]).toEqualTypeOf<"public">();
expectTypeOf(deep["~Error"]).toEqualTypeOf<never>();
expectTypeOf(node["~RuntimeAndFunctionType"]).toEqualTypeOf<{ readonly runtime: "Node"; readonly functionType: "action" }>();
expectTypeOf(Spec.groups(spec).${lastRoot}.name).toEqualTypeOf<"${lastRoot}">();
// @ts-expect-error
const missing = refs.public.missing;
// @ts-expect-error
const missingDeep = refs.public.nested.${lastChild}.level3.level4.missing;
// @ts-expect-error
const privateNode = refs.public.jobs;
// @ts-expect-error
const wrongArgs: typeof deep["~Args"] = { id: 1 };
`;
        yield* fs.writeFileString(
          path.join(directory, "consumer.ts"),
          consumer,
        );
        yield* fs.writeFileString(
          path.join(directory, "tsconfig.json"),
          `{
            "compilerOptions": {
              "strict": true,
              "declaration": true,
              "emitDeclarationOnly": true,
              "outDir": "declarations",
              "exactOptionalPropertyTypes": ${exactOptionalPropertyTypes},
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
        const declaration = yield* fs.readFileString(
          path.join(directory, "declarations", "_generated", "spec.d.ts"),
        );
        expect(declaration).toContain("declare const spec:");
        expect(declaration).toContain(
          `GroupSpec.NamedAt<typeof ${lastRoot}, "${lastRoot}">`,
        );
        expect(declaration).toContain(
          `typeof nested_${lastChild}_level3_level4_${lastDeep}`,
        );
        expect(declaration.match(/typeof /g)).toHaveLength(leaves.length);
        expect(declaration).not.toContain("effect/Schema");
        expect(declaration.split("\n").length).toBeLessThan(
          leaves.length * 2 + 10,
        );
        expect(declaration.length).toBeLessThan(leaves.length * 240);
        yield* fs.writeFileString(
          path.join(directory, "consumer.ts"),
          consumer.replace(
            '"./_generated/spec"',
            '"./declarations/_generated/spec"',
          ),
        );
        const declarationConsumer = yield* spawner.spawn(
          ChildProcess.make(process.execPath, [
            fileURLToPath(
              new URL(
                "bin/tsc",
                import.meta.resolve("typescript/package.json"),
              ),
            ),
            "-p",
            directory,
            "--noEmit",
            "--emitDeclarationOnly",
            "false",
          ]),
        );
        const declarationOutput = yield* declarationConsumer.all.pipe(
          Stream.decodeText(),
          Stream.mkString,
        );
        expect(yield* declarationConsumer.exitCode, declarationOutput).toBe(0);
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
