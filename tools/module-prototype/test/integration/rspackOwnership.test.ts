import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, expect, layer } from "@effect/vitest";
import { rspack, type Compiler, type Stats } from "@rspack/core";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { pathToFileURL } from "node:url";
import * as Bundler from "../../../../packages/cli/src/Bundler.ts";
import * as Compilation from "../../../../packages/cli/src/Compilation.ts";
import * as RspackGraph from "../../src/RspackGraph.ts";
import * as RspackInputs from "../../src/RspackInputs.ts";
import * as RspackOwnership from "../../src/RspackOwnership.ts";

class Failed extends Schema.TaggedError<Failed>()("RspackOwnershipTestFailed", {
  cause: Schema.Unknown,
}) {}

const fixture = Effect.fn("RspackOwnershipTest.fixture")(function* (
  files: Readonly<Record<string, string>>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped();
  const file = (relative: string) => path.join(root, relative);
  for (const [relative, contents] of Object.entries(files)) {
    yield* fs.makeDirectory(path.dirname(file(relative)), { recursive: true });
    yield* fs.writeFileString(file(relative), contents);
  }
  const ownership = {
    ownedDirectories: [file("confect/_generated"), file("convex")],
    authoredFiles: [
      file("convex/convex.config.ts"),
      file("convex/tsconfig.json"),
      file("convex/package.json"),
    ],
  };
  return { root, file, ownership };
});

const compile = Effect.fn("RspackOwnershipTest.compile")(function* (
  entry: string,
  ownership: RspackOwnership.Options,
  deniedBasenames: ReadonlyArray<string> = [],
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const output = yield* fs.makeTempDirectoryScoped();
  const policy = RspackOwnership.make(path, ownership);
  const recording = RspackInputs.make({ deniedBasenames });
  const compiler = yield* Effect.acquireRelease(
    Effect.try({
      try: () =>
        rspack({
          mode: "development",
          context: path.dirname(entry),
          entry: { "0": entry },
          target: "node",
          cache: false,
          incremental: false,
          devtool: false,
          experiments: { useInputFileSystem: [/.*/] },
          resolve: { extensions: [".ts", ".js", ".json"], symlinks: true },
          module: {
            rules: [
              ...policy.rules,
              {
                test: /\.([mc]?[tj]s|[tj]sx)$/,
                type: "javascript/auto",
                resolve: { fullySpecified: false },
                use: [{ loader: "builtin:swc-loader" }],
              },
            ],
          },
          plugins: [policy.plugin],
          optimization: { minimize: false, concatenateModules: false },
          output: {
            path: output,
            filename: "entry.mjs",
            module: true,
            library: { type: "module" },
          },
        }),
      catch: (cause) => new Failed({ cause }),
    }),
    (engine: Compiler) =>
      Effect.callback<void, Failed>((resume) => {
        engine.close((cause) =>
          resume(cause ? Effect.fail(new Failed({ cause })) : Effect.void),
        );
      }).pipe(Effect.orDie),
  );
  compiler.inputFileSystem = recording.fileSystem;
  const completed = yield* Effect.callback<Stats, Failed>((resume) => {
    compiler.run((cause, stats) =>
      resume(
        cause || !stats || stats.hasErrors()
          ? Effect.fail(
              new Failed({
                cause: cause ?? stats?.toString({ all: false, errors: true }),
              }),
            )
          : Effect.succeed(stats),
      ),
    );
  }).pipe(Effect.result);
  const inputs = yield* recording.capture;
  const stats = yield* Effect.fromResult(completed);
  yield* inputs.validate;
  return {
    policy,
    inputs,
    graph: RspackGraph.capture(stats, [entry]),
    url: pathToFileURL(path.join(output, "entry.mjs")).href,
  };
});

const load = (url: string) =>
  Effect.tryPromise({
    try: (): Promise<unknown> => import(url),
    catch: (cause) => new Failed({ cause }),
  }).pipe(
    Effect.flatMap(
      Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Unknown)),
    ),
  );

const oracle = (entry: string, ownership: RspackOwnership.Options) =>
  Effect.gen(function* () {
    const compiled = yield* Bundler.compile(entry);
    return yield* load(compiled.url);
  }).pipe(Effect.provide(Compilation.layer({ mode: "Once", ...ownership })));

layer(NodeServices.layer, { excludeTestServices: true })(
  "Rspack generated ownership with source inputs",
  (it) => {
    it.effect(
      "loads generated non-code files as text and generated JSON as JSON without traversing text imports",
      () =>
        Effect.gen(function* () {
          const generated =
            'import "./does-not-exist"; throw new Error("must not run"); invalid JavaScript';
          const { file, ownership } = yield* fixture({
            "entry.ts":
              'import source from "./confect/_generated/spec.txt"; import convex from "./convex/functions.mjsx"; import json from "./convex/data.json"; export default { source, convex, json };',
            "confect/_generated/spec.txt": generated,
            "convex/functions.mjsx": "this is not JavaScript either",
            "convex/data.json": '{"value":42}',
          });
          const built = yield* compile(file("entry.ts"), ownership);
          expect((yield* load(built.url)).default).toEqual({
            source: generated,
            convex: "this is not JavaScript either",
            json: { value: 42 },
          });
          expect((yield* load(built.url)).default).toEqual(
            (yield* oracle(file("entry.ts"), ownership)).default,
          );
          expect(built.graph.modules).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                file: file("confect/_generated/spec.txt"),
                type: "asset/source",
                source: generated,
                imports: [],
              }),
              expect.objectContaining({
                file: file("convex/data.json"),
                type: "json",
                imports: [],
              }),
            ]),
          );
          expect(built.inputs.observations).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                method: "readFile",
                path: file("confect/_generated/spec.txt"),
              }),
              expect.objectContaining({
                method: "readFile",
                path: file("convex/data.json"),
              }),
            ]),
          );
          expect(
            built.inputs.observations.some((item) =>
              item.path.includes("does-not-exist"),
            ),
          ).toBe(false);
        }).pipe(Effect.scoped),
    );

    it.effect(
      "rejects invalid generated TypeScript as code instead of silently loading it as text",
      () =>
        Effect.gen(function* () {
          const { file, ownership } = yield* fixture({
            "entry.ts":
              'import source from "./confect/_generated/spec"; export default source;',
            "confect/_generated/spec.ts":
              'import "./does-not-exist"; throw new Error("must not run"); invalid JavaScript',
          });
          const failed = yield* compile(file("entry.ts"), ownership).pipe(
            Effect.result,
          );
          assert(Result.isFailure(failed));
          expect(failed.failure).toBeInstanceOf(Failed);
          const production = yield* oracle(file("entry.ts"), ownership).pipe(
            Effect.result,
          );
          assert(Result.isFailure(production));
          expect(production.failure._tag).toBe("BundlerError");
        }).pipe(Effect.scoped),
    );

    it.effect(
      "matches production named generated exports and recursively traverses generated code to authored inputs",
      () =>
        Effect.gen(function* () {
          const { file, ownership } = yield* fixture({
            "entry.ts":
              'import { Id } from "./confect/_generated/dataModel"; import { generatedValue } from "./convex/functions"; export default [Id, generatedValue];',
            "confect/_generated/dataModel.ts":
              'export { Id } from "./runtime";',
            "confect/_generated/runtime.ts":
              'import { prefix } from "../../authored"; export const Id: string = prefix + ":id"; export const generatedValue = prefix + ":runtime";',
            "convex/functions.js":
              'export { generatedValue } from "../confect/_generated/runtime";',
            "authored.ts": 'export const prefix = "authored";',
          });
          const built = yield* compile(file("entry.ts"), ownership);
          const actual = (yield* load(built.url)).default;
          expect(actual).toEqual(["authored:id", "authored:runtime"]);
          expect(actual).toEqual(
            (yield* oracle(file("entry.ts"), ownership)).default,
          );
          const dataModel = built.graph.modules.find(
            (module) => module.file === file("confect/_generated/dataModel.ts"),
          );
          const runtime = built.graph.modules.find(
            (module) => module.file === file("confect/_generated/runtime.ts"),
          );
          const authored = built.graph.modules.find(
            (module) => module.file === file("authored.ts"),
          );
          assert(dataModel && runtime && authored);
          expect(dataModel.type).toBe("javascript/auto");
          expect(runtime.type).toBe("javascript/auto");
          expect(dataModel.imports).toContainEqual(
            expect.objectContaining({ id: runtime.id }),
          );
          expect(runtime.imports).toContainEqual(
            expect.objectContaining({ id: authored.id }),
          );
          for (const source of [
            "confect/_generated/dataModel.ts",
            "confect/_generated/runtime.ts",
            "convex/functions.js",
            "authored.ts",
          ])
            expect(built.inputs.observations).toContainEqual(
              expect.objectContaining({
                method: "readFile",
                path: file(source),
              }),
            );
        }).pipe(Effect.scoped),
    );

    it.effect.each(["ts", "js", "mts", "mjs", "cts", "cjs", "tsx", "jsx"])(
      "matches the production injected code-loader extension .%s",
      (extension) =>
        Effect.gen(function* () {
          const generated = `convex/generated.${extension}`;
          const { file, ownership } = yield* fixture({
            "entry.ts": `export { value } from "./${generated}";`,
            [generated]: "export const value = 42;",
          });
          const built = yield* compile(file("entry.ts"), ownership);
          expect((yield* load(built.url)).value).toBe(42);
          expect((yield* load(built.url)).value).toBe(
            (yield* oracle(file("entry.ts"), ownership)).value,
          );
          expect(built.graph.modules).toContainEqual(
            expect.objectContaining({
              file: file(generated),
              type: "javascript/auto",
            }),
          );
        }).pipe(Effect.scoped),
    );

    it.effect(
      "preserves explicit authored exceptions and does not reserve their basenames elsewhere",
      () =>
        Effect.gen(function* () {
          const { file, ownership } = yield* fixture({
            "entry.ts":
              'import config from "./convex/convex.config"; import tsconfig from "./convex/tsconfig.json"; import pkg from "./convex/package.json"; import nested from "./convex/nested/convex.config.txt"; export default { config, tsconfig, pkg, nested };',
            "convex/convex.config.ts":
              'const config: string = "authored config"; export default config;',
            "convex/tsconfig.json": '{"compilerOptions":{}}',
            "convex/package.json": '{"name":"authored-package"}',
            "convex/nested/convex.config.txt": "invalid generated config",
          });
          const built = yield* compile(file("entry.ts"), ownership);
          expect((yield* load(built.url)).default).toEqual({
            config: "authored config",
            tsconfig: { compilerOptions: {} },
            pkg: { name: "authored-package" },
            nested: "invalid generated config",
          });
          expect(
            built.graph.modules.find(
              (module) => module.file === file("convex/convex.config.ts"),
            )?.type,
          ).toBe("javascript/auto");
        }).pipe(Effect.scoped),
    );

    it.effect(
      "canonicalizes symlinked ownership roots and preserves their authored exceptions",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const { file, ownership } = yield* fixture({
            "entry.ts":
              'import generated from "./alias/generated.txt"; import config from "./alias/convex.config"; export default [generated, config];',
            "convex/generated.txt": "generated bytes",
            "convex/convex.config.ts": 'export default "authored";',
          });
          yield* fs.symlink(file("convex"), file("alias"));
          const built = yield* compile(file("entry.ts"), {
            ...ownership,
            ownedDirectories: [file("alias")],
            authoredFiles: [
              file("alias/convex.config.ts"),
              file("alias/tsconfig.json"),
              file("alias/package.json"),
            ],
          });
          expect((yield* load(built.url)).default).toEqual([
            "generated bytes",
            "authored",
          ]);
          expect(built.policy.owns(file("convex/generated.txt"))).toBe(true);
          expect(built.policy.owns(file("convex/convex.config.ts"))).toBe(
            false,
          );
          expect(built.inputs.observations).toContainEqual(
            expect.objectContaining({
              method: "realpath",
              path: file("alias"),
            }),
          );
        }).pipe(Effect.scoped),
    );

    it.effect(
      "uses resolved-path ownership for escaping symlinks and canonical authored exceptions",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const { file, ownership } = yield* fixture({
            "entry.ts":
              'import escaped from "./convex/escape"; import config from "./convex/convex.config"; export default [escaped, config];',
            "outside.ts": 'export default "outside authored source";',
            "convex/config-source.ts":
              'export default "canonical authored exception";',
          });
          yield* fs.symlink(file("outside.ts"), file("convex/escape.ts"));
          yield* fs.symlink(
            file("convex/config-source.ts"),
            file("convex/convex.config.ts"),
          );
          const built = yield* compile(file("entry.ts"), ownership);
          expect((yield* load(built.url)).default).toEqual([
            "outside authored source",
            "canonical authored exception",
          ]);
          expect(built.policy.owns(file("outside.ts"))).toBe(false);
          expect(built.policy.owns(file("convex/config-source.ts"))).toBe(
            false,
          );
        }).pipe(Effect.scoped),
    );

    it.effect(
      "keeps generated source reads under protected lexical and canonical input policy",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const { file, ownership } = yield* fixture({
            "entry.ts": 'export { default } from "./convex/alias.ts";',
            "denied-fixture": "innocuous fixture",
          });
          yield* fs.makeDirectory(file("convex"));
          yield* fs.symlink(file("denied-fixture"), file("convex/alias.ts"));
          const denied = yield* compile(file("entry.ts"), ownership, [
            "denied-fixture",
          ]).pipe(Effect.result);
          assert(Result.isFailure(denied));
          expect(denied.failure).toBeInstanceOf(RspackInputs.Failed);
          expect(denied.failure).toMatchObject({
            reason: "ProtectedRealpath",
          });
        }).pipe(Effect.scoped),
    );

    it.effect(
      "retains acquired generated bytes and rejects a stale capture after generated output changes",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const { file, ownership } = yield* fixture({
            "entry.ts": 'export { default } from "./convex/generated.txt";',
            "convex/generated.txt": "original generated bytes",
          });
          const built = yield* compile(file("entry.ts"), ownership);
          yield* fs.writeFileString(
            file("convex/generated.txt"),
            "new generated bytes",
          );
          expect((yield* load(built.url)).default).toBe(
            "original generated bytes",
          );
          const stale = yield* built.inputs.validate.pipe(Effect.result);
          assert(Result.isFailure(stale));
          expect(stale.failure).toBeInstanceOf(RspackInputs.Changed);
          const fresh = yield* compile(file("entry.ts"), ownership);
          expect((yield* load(fresh.url)).default).toBe("new generated bytes");
        }).pipe(Effect.scoped),
    );
  },
);
