import { fileURLToPath } from "node:url";
import * as Bundler from "@confect/cli/Bundler";
import type { LeafModule } from "@confect/cli/LeafModule";
import { assemblyNodesFromLeaves } from "@confect/cli/SpecAssemblyNode";
import * as templates from "@confect/cli/templates";
import { type FunctionSpec, type GroupSpec, Refs, Spec } from "@confect/core";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, expect, it, layer } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Order from "effect/Order";
import * as Path from "effect/Path";
import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
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
    specImportPath: `../${relativePath.slice(0, -".ts".length)}`,
  };
};

it.effect.each([false, true])(
  "keeps handler forwarding local only for isolate groups (useNode=%s)",
  (useNode) =>
    Effect.gen(function* () {
      const code = yield* templates.registeredFunctionsForGroup({
        schemaImportPath: "../schema",
        specImportPath: "../../notes.spec",
        implImportPath: "../../notes.impl",
        layerExportName: "notes",
        useNode,
      });
      expect(code).toContain('import notes from "../../notes.impl";');
      expect(code).toContain('typeof import("../../notes.spec")["default"]');
      if (useNode) {
        expect(code).toContain("RegisteredNodeFunction.buildForGroup");
        expect(code).not.toContain(
          "=> (ctx: Ctx, args: Args) => handler(ctx, args)",
        );
      } else {
        expect(code).toContain(
          "=> (ctx: Ctx, args: Args) => handler(ctx, args)",
        );
        expect(code).toContain("ConvexFunctionDefinitions.register<");
        expect(code).not.toContain("queryGeneric");
        expect(code).not.toContain('from "convex/server"');
        expect(code).not.toContain("const register =");
        expect(code).not.toContain("RegisteredNodeFunction");
      }
    }),
);

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
  interface GroupSnapshot {
    readonly path: ReadonlyArray<string>;
    readonly name: string;
    readonly runtime: GroupSpec.AnyWithProps["runtime"];
    readonly functions: ReadonlyArray<{
      readonly name: string;
      readonly runtimeAndFunctionType: FunctionSpec.AnyWithProps["runtimeAndFunctionType"];
      readonly visibility: FunctionSpec.AnyWithProps["functionVisibility"];
    }>;
  }

  const groupSnapshots = (
    groups: Record.ReadonlyRecord<string, GroupSpec.AnyWithProps>,
    parentPath: ReadonlyArray<string> = [],
  ): ReadonlyArray<GroupSnapshot> =>
    Array.flatMap(Record.toEntries(groups), ([name, group]) => {
      const path = Array.append(parentPath, name);
      const snapshot: GroupSnapshot = {
        path,
        name: group.name,
        runtime: group.runtime,
        functions: Array.map(Record.values(group.functions), (fn) => ({
          name: fn.name,
          runtimeAndFunctionType: fn.runtimeAndFunctionType,
          visibility: fn.functionVisibility,
        })),
      };
      return Array.prepend(groupSnapshots(group.groups, path), snapshot);
    });

  const sortSnapshots = Array.sortBy<ReadonlyArray<GroupSnapshot>>(
    Order.mapInput(Order.String, (group: GroupSnapshot) =>
      Array.join(group.path, "/"),
    ),
  );

  const lookupRef = (
    refs: unknown,
    path: ReadonlyArray<string>,
  ): Record.ReadonlyRecord<string, unknown> => {
    const ref = Array.reduce(path, refs, (parent, segment) => {
      assert(Predicate.isObject(parent));
      return parent[segment];
    });
    assert(Predicate.isObject(ref));
    return ref;
  };

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
          leafAt(["__proto__"]),
          leafAt(["nested", "__proto__"]),
        ];
        yield* fs.makeDirectory(path.join(directory, "_generated"));
        yield* fs.writeFileString(
          path.join(directory, "schemaReads.ts"),
          "export const schemaReads = { args: 0, returns: 0, error: 0 };\n",
        );
        yield* Effect.forEach(leaves, (leaf) =>
          Effect.gen(function* () {
            const target = path.join(directory, leaf.relativePath);
            const isNode = leaf.groupPathDot === "jobs";
            const schemaReadsImport =
              leaf.pathSegments.length === 1
                ? "./schemaReads"
                : `${"../".repeat(leaf.pathSegments.length - 1)}schemaReads`;
            yield* fs.makeDirectory(path.dirname(target), { recursive: true });
            yield* fs.writeFileString(
              target,
              `import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import { schemaReads } from "${schemaReadsImport}";

export default GroupSpec.${isNode ? "makeNode" : "make"}().addFunction(
  FunctionSpec.${isNode ? "internalNodeAction" : "publicQuery"}({
    name: "get",
    args: () => { schemaReads.args++; return { id: Schema.String }; },
    returns: () => { schemaReads.returns++; return Schema.String; },
    ${isNode ? "error: () => { schemaReads.error++; return Schema.String; }," : ""}
  }),
);
`,
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
const rootProto = refs.public.__proto__.get;
const nestedProto = refs.public.nested.__proto__.get;
expectTypeOf<keyof typeof refs.public>().toEqualTypeOf<${[...rootNames, "nested", "__proto__"].map((name) => `"${name}"`).join(" | ")}>();
expectTypeOf<keyof typeof refs.public.nested>().toEqualTypeOf<${[...childNames, "get", "__proto__"].map((name) => `"${name}"`).join(" | ")}>();
expectTypeOf(last["~Args"]).toEqualTypeOf<{ readonly id: string }>();
expectTypeOf(nested).toEqualTypeOf<typeof last>();
expectTypeOf(parent).toEqualTypeOf<typeof last>();
expectTypeOf(middle).toEqualTypeOf<typeof last>();
expectTypeOf(rootProto).toEqualTypeOf<typeof last>();
expectTypeOf(nestedProto).toEqualTypeOf<typeof last>();
expectTypeOf(deep["~Returns"]).toEqualTypeOf<string>();
expectTypeOf(deep["~FunctionVisibility"]).toEqualTypeOf<"public">();
expectTypeOf(deep["~Error"]).toEqualTypeOf<never>();
expectTypeOf(node["~RuntimeAndFunctionType"]).toEqualTypeOf<{ readonly runtime: "Node"; readonly functionType: "action" }>();
expectTypeOf(node["~Error"]).toEqualTypeOf<string>();
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
        const runtimeEntry = path.join(directory, "runtime.ts");
        yield* fs.writeFileString(
          runtimeEntry,
          `export { default } from "./_generated/spec";
export { schemaReads } from "./schemaReads";
`,
        );
        const bundled = yield* Bundler.bundle(runtimeEntry);
        const assembled: unknown = bundled.module.default;
        assert(Spec.isSpec(assembled));
        const groups = Spec.groups(assembled);
        expect(Object.hasOwn(groups, "__proto__")).toBe(true);
        expect(Object.hasOwn(groups.nested.groups, "__proto__")).toBe(true);
        expect(bundled.module.schemaReads).toEqual({
          args: 0,
          returns: 0,
          error: 0,
        });

        const expectedGroups = Array.append(
          Array.map(leaves, (leaf): GroupSnapshot => ({
            path: leaf.pathSegments,
            name: leaf.exportName,
            runtime: leaf.groupPathDot === "jobs" ? "Node" : "Convex",
            functions: [
              {
                name: "get",
                runtimeAndFunctionType:
                  leaf.groupPathDot === "jobs"
                    ? { runtime: "Node", functionType: "action" }
                    : { runtime: "Convex", functionType: "query" },
                visibility:
                  leaf.groupPathDot === "jobs" ? "internal" : "public",
              },
            ],
          })),
          {
            path: ["nested", lastChild, "level3", "level4"],
            name: "level4",
            runtime: "Convex",
            functions: [],
          } satisfies GroupSnapshot,
        );
        expect(sortSnapshots(groupSnapshots(groups))).toEqual(
          sortSnapshots(expectedGroups),
        );

        const refs = Refs.make(assembled);
        expect(bundled.module.schemaReads).toEqual({
          args: 0,
          returns: 0,
          error: 0,
        });
        for (const leaf of leaves) {
          const ref = lookupRef(
            refs[leaf.groupPathDot === "jobs" ? "internal" : "public"],
            Array.append(leaf.pathSegments, "get"),
          );
          expect(ref.convexFunctionName).toBe(
            `${leaf.pathSegments.join("/")}:get`,
          );
          expect(ref._tag).toBe("Confect");
        }
        expect(bundled.module.schemaReads).toEqual({
          args: 0,
          returns: 0,
          error: 0,
        });
        const nodeRef = lookupRef(refs.internal, ["jobs", "get"]);
        expect(nodeRef.args).toBe(nodeRef.args);
        expect(nodeRef.returns).toBe(nodeRef.returns);
        expect(nodeRef.error).toBe(nodeRef.error);
        expect(bundled.module.schemaReads).toEqual({
          args: 1,
          returns: 1,
          error: 1,
        });
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
