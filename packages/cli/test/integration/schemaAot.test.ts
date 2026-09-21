import * as AotCompiler from "@confect/cli/AotCompiler";
import { codegenHandler } from "@confect/cli/confect/codegen";
import { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import { ConvexDirectory } from "@confect/cli/ConvexDirectory";
import { ProjectRoot } from "@confect/cli/ProjectRoot";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import * as esbuild from "esbuild";

const tableSource = `
import * as Table from "@confect/core/Table";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";
export const stats = { builds: 0, decodes: 0, encodes: 0 };
export default Table.make(() => {
  stats.builds++;
  return Schema.Struct({ text: Schema.String }).pipe(Schema.decodeTo(Schema.Struct({ length: Schema.Finite }), {
    decode: SchemaGetter.transform(({ text }) => { stats.decodes++; return { length: text.length }; }),
    encode: SchemaGetter.transform(({ length }) => { stats.encodes++; return { text: "x".repeat(length) }; }),
  }));
});
`;

const specSource = `
import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
export default GroupSpec.make().addFunction(FunctionSpec.publicQuery({
  name: "echo",
  args: () => ({ count: Schema.NumberFromString }),
  returns: () => Schema.NumberFromString,
  error: () => Schema.Struct({ reason: Schema.String }),
}));
`;

const implSource = (name: string) => `
import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "./_generated/schema";
import spec from "./${name}.spec";
const echo = FunctionImpl.make(databaseSchema, spec, "echo", ({ count }) => count < 0 ? Effect.fail({ reason: "negative" }) : Effect.succeed(count + 1));
export default GroupImpl.make(databaseSchema, spec).pipe(Layer.provide(echo), GroupImpl.finalize);
`;

const makeProject = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({
    directory: import.meta.dirname,
    prefix: "schema-aot-",
  });
  const confect = path.join(root, "confect");
  const convex = path.join(root, "convex");
  yield* fs.makeDirectory(path.join(confect, "tables"), { recursive: true });
  yield* fs.makeDirectory(convex);
  const files = {
    "package.json": '{"type":"module"}',
    "confect/tables/notes.ts": tableSource,
    "confect/tables/unused.ts": tableSource,
    "confect/primary.spec.ts": specSource,
    "confect/primary.impl.ts": implSource("primary"),
    "confect/sibling.spec.ts": specSource,
    "confect/sibling.impl.ts": implSource("sibling"),
    "convex/convex.config.ts":
      'import { defineApp } from "convex/server"; export default defineApp();',
  };
  for (const [name, contents] of Object.entries(files)) {
    yield* fs.writeFileString(path.join(root, name), contents);
  }
  const directories = Layer.mergeAll(
    Layer.succeed(ProjectRoot, { get: Effect.succeed(root) }),
    Layer.succeed(ConfectDirectory, { get: Effect.succeed(confect) }),
    Layer.succeed(ConvexDirectory, { get: Effect.succeed(convex) }),
  );
  return { root, confect, directories };
});

layer(NodeServices.layer)("schema AOT codegen integration", (it) => {
  it.effect(
    "runs scoped generated codecs without dynamic code generation",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner;
        const { root, directories } = yield* makeProject;
        const generate = codegenHandler.pipe(
          Effect.provide(directories),
          Effect.provideService(AotCompiler.Enabled, true),
        );
        expect((yield* generate).anyWritesHappened).toBe(true);
        expect((yield* generate).anyWritesHappened).toBe(false);
        const source = `
import assert from "node:assert/strict";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import * as Document from "@confect/server/Document";
import table from "./confect/_generated/tables/notes";
import { stats } from "./confect/tables/notes";
import { stats as unused } from "./confect/tables/unused";
import registered from "./confect/_generated/registeredFunctions/primary";
assert.equal(stats.builds, 0);
assert.equal(unused.builds, 0);
const input = { text: "hello", _id: "abc123", _creationTime: 42 };
const doc = Effect.runSync(Document.decode(input, "notes", table));
assert.deepEqual(doc, { length: 5, _id: "abc123", _creationTime: 42 });
assert.equal(stats.builds, 1);
assert.equal(stats.decodes, 1);
assert.deepEqual(Effect.runSync(Schema.encodeEffect(table.Fields)(doc)), { text: "xxxxx" });
assert.equal(stats.encodes, 1);
assert.deepEqual(input, { text: "hello", _id: "abc123", _creationTime: 42 });
assert.equal(await registered.echo._handler({}, { count: "41" }), "42");
await assert.rejects(registered.echo._handler({}, { count: "-1" }), error => error.data.reason === "negative");
assert.throws(() => Effect.runSync(Document.decode({ ...input, text: 42 }, "notes", table)));
assert.equal(unused.builds, 0);
process.stdout.write("schema-aot-ok");
`;
        const entry = path.join(root, "run.ts");
        const out = path.join(root, "run.mjs");
        yield* fs.writeFileString(entry, source);
        const bundled = yield* Effect.promise(() =>
          esbuild.build({
            entryPoints: [entry],
            outfile: out,
            bundle: true,
            format: "esm",
            platform: "node",
            packages: "external",
            metafile: true,
          }),
        );
        const inputs = Object.keys(bundled.metafile.inputs).join("\n");
        expect(inputs).toContain("schemaCompilers/groups/primary/echo.js");
        expect(inputs).not.toContain("sibling.impl");
        expect(inputs).not.toContain("schemaCompilers/groups/sibling");
        const output = yield* fs.readFileString(out);
        expect(output).not.toContain("SchemaAOTCompiler");
        expect(output).not.toContain("SchemaJITCompiler");
        expect(output).not.toContain("new Function");
        expect(
          yield* spawner.string(
            ChildProcess.make(process.execPath, [
              "--disallow-code-generation-from-strings",
              out,
            ]),
          ),
        ).toBe("schema-aot-ok");

        const config = path.join(root, "tsconfig.json");
        yield* fs.writeFileString(
          config,
          yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
            compilerOptions: {
              strict: true,
              noEmit: true,
              target: "ESNext",
              module: "ESNext",
              moduleResolution: "Bundler",
              skipLibCheck: true,
              types: ["node"],
            },
            include: ["confect/**/*.ts", "convex/**/*.ts"],
          }),
        );
        const typescript = path.dirname(
          yield* path.fromFileUrl(
            new URL(import.meta.resolve("typescript/package.json")),
          ),
        );
        expect(
          yield* spawner.string(
            ChildProcess.make(process.execPath, [
              path.join(typescript, "lib", "tsc.js"),
              "--project",
              config,
              "--pretty",
              "false",
            ]),
          ),
        ).toBe("");
      }),
    { timeout: 30000 },
  );

  it.effect(
    "regenerates stale artifacts and removes renamed or disabled output",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { confect, directories } = yield* makeProject;
        const generate = codegenHandler.pipe(Effect.provide(directories));
        const aot = generate.pipe(
          Effect.provideService(AotCompiler.Enabled, true),
        );
        yield* aot;
        const compilers = path.join(confect, "_generated/schemaCompilers");
        const fields = path.join(compilers, "tables/notes/fields.js");
        yield* fs.writeFileString(
          fields,
          "this file is deliberately invalid JavaScript",
        );
        yield* fs.writeFileString(
          path.join(confect, "tables/notes.ts"),
          tableSource.replace(
            "text: Schema.String",
            "text: Schema.NonEmptyString",
          ),
        );
        expect((yield* aot).anyWritesHappened).toBe(true);
        expect(yield* fs.readFileString(fields)).toContain(
          "export function install",
        );
        yield* fs.rename(
          path.join(confect, "tables/unused.ts"),
          path.join(confect, "tables/renamed.ts"),
        );
        yield* aot;
        expect(
          yield* fs.exists(path.join(compilers, "tables/unused/fields.js")),
        ).toBe(false);
        expect(
          yield* fs.exists(path.join(compilers, "tables/renamed/fields.js")),
        ).toBe(true);
        yield* generate;
        expect(yield* fs.exists(compilers)).toBe(false);
        expect(
          yield* fs.readFileString(
            path.join(confect, "_generated/tables/notes.ts"),
          ),
        ).not.toContain("schemaCompilers");
        expect(
          yield* fs.readFileString(
            path.join(confect, "_generated/registeredFunctions/primary.ts"),
          ),
        ).not.toContain("schemaCompilers");
        expect((yield* generate).anyWritesHappened).toBe(false);
      }),
    { timeout: 30000 },
  );
});
