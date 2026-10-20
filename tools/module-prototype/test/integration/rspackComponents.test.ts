import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, expect, layer } from "@effect/vitest";
import { rspack, type Compiler, type Stats } from "@rspack/core";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { pathToFileURL } from "node:url";
import * as ConvexConfig from "../../../../packages/cli/src/ConvexConfig.ts";
import * as CompilationInputs from "../../../../packages/cli/src/CompilationInputs.ts";
import * as RspackComponents from "../../src/RspackComponents.ts";
import * as RspackExternals from "../../src/RspackExternals.ts";
import * as RspackGraph from "../../src/RspackGraph.ts";
import * as RspackInputs from "../../src/RspackInputs.ts";
import * as RspackOwnership from "../../src/RspackOwnership.ts";

class Failed extends Schema.TaggedError<Failed>()(
  "RspackComponentsTestFailed",
  {
    cause: Schema.Unknown,
  },
) {}

const fixture = Effect.fn("RspackComponentsTest.fixture")(function* (
  files: Readonly<Record<string, string>>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({
    directory: path.resolve(
      import.meta.dirname,
      "../../../../packages/cli/test",
    ),
  });
  const file = (relative: string) => path.join(root, relative);
  for (const [relative, contents] of Object.entries(files)) {
    yield* fs.makeDirectory(path.dirname(file(relative)), { recursive: true });
    yield* fs.writeFileString(file(relative), contents);
  }
  return { file };
});

const compile = Effect.fn("RspackComponentsTest.compile")(function* (
  entry: string,
  deniedBasenames: ReadonlyArray<string> = [],
  withExternals = false,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const output = yield* fs.makeTempDirectoryScoped();
  const components = RspackComponents.make(path);
  const ownership = RspackOwnership.make(path, {
    ownedDirectories: [path.dirname(entry)],
    authoredFiles: [entry],
  });
  const recording = RspackInputs.make({ deniedBasenames });
  const metadata = yield* CompilationInputs.make("Once", ["node"]);
  const external = withExternals
    ? yield* RspackExternals.make({ inputs: metadata, conditions: ["node"] })
    : undefined;
  const engine = yield* Effect.acquireRelease(
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
          externals: external
            ? (data, callback) => {
                if (
                  data.request &&
                  (components.isDefinition(data.request) ||
                    components.isWrapper(data.request) ||
                    components.isSource(data.request))
                ) {
                  callback();
                  return;
                }
                return external.externals(data, callback);
              }
            : [],
          plugins: [
            ownership.plugin,
            components.plugin,
            ...(external ? [external.plugin] : []),
          ],
          resolve: {
            extensions: [".ts", ".js", ".json"],
            byDependency: {
              esm: { conditionNames: ["import", "node", "default"] },
              commonjs: { conditionNames: ["require", "node", "default"] },
            },
          },
          module: {
            rules: [
              ...ownership.rules,
              ...components.rules,
              {
                test: /\.([mc]?[tj]s|[tj]sx)$/,
                type: "javascript/auto",
                resolve: { fullySpecified: false },
                use: [{ loader: "builtin:swc-loader" }],
              },
            ],
          },
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
    (compiler: Compiler) =>
      Effect.callback<void, Failed>((resume) => {
        compiler.close((cause) =>
          resume(cause ? Effect.fail(new Failed({ cause })) : Effect.void),
        );
      }).pipe(Effect.orDie),
  );
  engine.inputFileSystem = recording.fileSystem;
  const completed = yield* Effect.callback<Stats, Failed>((resume) => {
    engine.run((cause, stats) =>
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
  const externalCapture = external ? yield* external.capture : undefined;
  yield* inputs.validate;
  return {
    components,
    external: externalCapture,
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

layer(NodeServices.layer, { excludeTestServices: true })(
  "Rspack ESM component-config profile with real definitions",
  (it) => {
    it.effect(
      "evaluates local and nested definitions through real convex/server without wrapping the app entry",
      () =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "convex/convex.config.ts":
              'import { defineApp } from "convex/server"; import child from "./child/convex.config"; const app = defineApp(); app.use(child); app.use(child, { name: "second" }); export default app;',
            "convex/child/convex.config.ts":
              'import { defineComponent } from "convex/server"; import nested from "../nested/convex.config.js"; const child = defineComponent("declared_name"); child.use(nested); export default child;',
            "convex/nested/convex.config.ts":
              'import { defineComponent } from "convex/server"; export default defineComponent("nested");',
          });
          const built = yield* compile(file("convex/convex.config.ts"));
          const loaded = yield* load(built.url);
          expect(
            yield* ConvexConfig.parseInstalledComponents(
              loaded.default,
              "convex.config.ts",
            ),
          ).toEqual([
            {
              name: "declared_name",
              componentDefinitionPath: file("convex/child"),
            },
            { name: "second", componentDefinitionPath: file("convex/child") },
          ]);
          expect(
            yield* ConvexConfig.parseInstalledComponents(
              loaded.default,
              "convex.config.ts",
            ),
          ).toEqual(
            yield* ConvexConfig.discoverInstalledComponents(
              file("convex/convex.config.ts"),
              "convex.config.ts",
            ),
          );
          expect(loaded.default).not.toHaveProperty("componentDefinitionPath");
          for (const source of [
            "convex/convex.config.ts",
            "convex/child/convex.config.ts",
            "convex/nested/convex.config.ts",
          ])
            expect(built.inputs.observations).toContainEqual(
              expect.objectContaining({
                method: "readFile",
                path: file(source),
              }),
            );
          expect(
            built.graph.modules.some(
              (module) =>
                module.file?.includes("convex/dist/") &&
                module.file.includes("components"),
            ),
          ).toBe(true);
          const wrappers = built.graph.modules.filter(
            (module) => module.file && built.components.isWrapper(module.file),
          );
          expect(wrappers).toHaveLength(2);
          for (const wrapper of wrappers)
            expect(wrapper.source).toContain("componentDefinitionPath");
          expect(
            built.components.isWrapper(
              "data:text/javascript,export default {}",
            ),
          ).toBe(false);
        }).pipe(Effect.scoped),
    );

    it.effect(
      "wraps repeated relative and absolute imports without mistaking an authored import for the internal source request",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const { file } = yield* fixture({
            "convex/convex.config.ts": "export {};",
            "convex/child/convex.config.ts":
              'export default { _name: "child" };',
          });
          const absolute = yield* Schema.encodeEffect(
            Schema.fromJsonString(Schema.String),
          )(file("convex/child/convex.config.ts"));
          yield* fs.writeFileString(
            file("convex/convex.config.ts"),
            `import first from "./child/convex.config"; import second from ${absolute}; export default [first.componentDefinitionPath, second.componentDefinitionPath];`,
          );
          const built = yield* compile(file("convex/convex.config.ts"));
          expect((yield* load(built.url)).default).toEqual([
            file("convex/child"),
            file("convex/child"),
          ]);
        }).pipe(Effect.scoped),
    );

    it.effect(
      "retains bare package component identities and honors native ESM export conditions",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const { file } = yield* fixture({
            "convex/convex.config.ts":
              'import { defineApp } from "convex/server"; import child from "component/convex.config"; const app = defineApp(); app.use(child); export default app;',
            "node_modules/component/package.json":
              '{"name":"component","type":"module","exports":{"./convex.config":{"import":"./one.ts","require":"./two.ts"}}}',
            "node_modules/component/one.ts":
              'import { defineComponent } from "convex/server"; export default defineComponent("imported");',
            "node_modules/component/two.ts":
              'throw new Error("wrong condition");',
          });
          const built = yield* compile(
            file("convex/convex.config.ts"),
            [],
            true,
          );
          expect(built.external?.observations).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ request: "convex/server" }),
            ]),
          );
          expect(
            built.external?.observations.some((item) =>
              item.request.includes("convex.config"),
            ),
          ).toBe(false);
          for (const observation of built.external?.observations ?? [])
            expect(
              built.graph.modules.some(
                (module) => module.file === observation.importer,
              ),
            ).toBe(true);
          expect(
            yield* ConvexConfig.parseInstalledComponents(
              (yield* load(built.url)).default,
              "convex.config.ts",
            ),
          ).toEqual([
            { name: "imported", componentDefinitionPath: "component" },
          ]);
          expect(built.inputs.observations).toContainEqual(
            expect.objectContaining({
              method: "readFile",
              path: file("node_modules/component/one.ts"),
            }),
          );
          expect(
            built.inputs.observations.some(
              (item) =>
                item.method === "readFile" &&
                item.path === file("node_modules/component/two.ts"),
            ),
          ).toBe(false);
          expect(
            built.components.isDefinition(
              file("node_modules/component/one.ts"),
            ),
          ).toBe(true);
          yield* fs.writeFileString(
            file("node_modules/component/one.ts"),
            'import { defineComponent } from "convex/server"; export default defineComponent("updated");',
          );
          const stale = yield* built.inputs.validate.pipe(Effect.result);
          assert(Result.isFailure(stale));
          expect(stale.failure).toBeInstanceOf(RspackInputs.Changed);
          const fresh = yield* compile(
            file("convex/convex.config.ts"),
            [],
            true,
          );
          expect(
            yield* ConvexConfig.parseInstalledComponents(
              (yield* load(fresh.url)).default,
              "convex.config.ts",
            ),
          ).toEqual([
            { name: "updated", componentDefinitionPath: "component" },
          ]);
        }).pipe(Effect.scoped),
    );

    it.effect("does not hide errors thrown by real component definitions", () =>
      Effect.gen(function* () {
        const { file } = yield* fixture({
          "convex/convex.config.ts":
            'import child from "./child/convex.config"; export default child;',
          "convex/child/convex.config.ts":
            'throw new Error("real definition evaluated"); export default {};',
        });
        const built = yield* compile(file("convex/convex.config.ts"));
        const failed = yield* load(built.url).pipe(Effect.result);
        assert(Result.isFailure(failed));
        expect(String(failed.failure.cause)).toContain(
          "real definition evaluated",
        );
      }).pipe(Effect.scoped),
    );

    it.effect(
      "rejects protected real definitions through the injected inputs",
      () =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "convex/convex.config.ts":
              'import child from "./denied-fixture/convex.config"; export default child;',
            "convex/denied-fixture/convex.config.ts":
              'export default { _name: "innocuous" };',
          });
          const failed = yield* compile(file("convex/convex.config.ts"), [
            "denied-fixture",
          ]).pipe(Effect.result);
          assert(Result.isFailure(failed));
          expect(failed.failure).toBeInstanceOf(RspackInputs.Failed);
          expect(failed.failure).toMatchObject({ reason: "ProtectedPath" });
        }).pipe(Effect.scoped),
    );

    it.effect(
      "rejects CommonJS config imports instead of choosing ESM conditions for them",
      () =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "convex/convex.config.ts":
              'const child = require("./child/convex.config.ts"); export default child;',
            "convex/child/convex.config.ts":
              'export default { _name: "child" };',
          });
          const failed = yield* compile(file("convex/convex.config.ts")).pipe(
            Effect.result,
          );
          assert(Result.isFailure(failed));
          assert(Schema.is(Failed)(failed.failure));
          expect(String(failed.failure.cause)).toContain(
            "NonEsmComponentImport",
          );
        }).pipe(Effect.scoped),
    );
  },
);
