import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, expect, layer } from "@effect/vitest";
import { rspack, type Compiler, type Module, type Stats } from "@rspack/core";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Bundler from "../../../../packages/cli/src/Bundler.ts";
import * as Compilation from "../../../../packages/cli/src/Compilation.ts";
import * as CompilationInputs from "../../../../packages/cli/src/CompilationInputs.ts";
import * as NodeConditions from "../../../../packages/cli/src/NodeConditions.ts";
import * as RspackExternals from "../../src/RspackExternals.ts";
import * as RspackInputs from "../../src/RspackInputs.ts";
import * as Runner from "../../src/Runner.ts";

class Failed extends Schema.TaggedError<Failed>()("RspackExternalsTestFailed", {
  cause: Schema.Unknown,
}) {}

const fixture = Effect.fn("RspackExternalsTest.fixture")(function* (
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
  return { root, file };
});

interface DependencyEvidence {
  readonly type: string;
  readonly request: string | undefined;
}

const dependencies = (
  block: Pick<Module, "dependencies" | "blocks">,
): ReadonlyArray<DependencyEvidence> => [
  ...block.dependencies.map((dependency) => ({
    type: dependency.type,
    request: dependency.request,
  })),
  ...block.blocks.flatMap(dependencies),
];

const compile = Effect.fn("RspackExternalsTest.compile")(function* (
  entry: string,
  options: {
    readonly rejectUnsupported?: boolean;
    readonly requireResolve?: boolean;
    readonly requireAsExpression?: boolean;
  } = {},
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const conditions = yield* NodeConditions.current;
  const inputs = yield* CompilationInputs.make("Once", conditions);
  const policy = yield* RspackExternals.make({ inputs, conditions });
  yield* policy.check(entry);
  const configuration = yield* inputs.configuration(entry);
  const configFile = path.join(
    yield* fs.makeTempDirectoryScoped(),
    "tsconfig.json",
  );
  yield* fs.writeFileString(
    configFile,
    yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(
      configuration.tsconfigRaw,
    ),
  );
  const output = yield* fs.makeTempDirectoryScoped();
  const recording = RspackInputs.make();
  const engine = yield* Effect.acquireRelease(
    Effect.try({
      try: () =>
        rspack({
          mode: "development",
          context: path.dirname(entry),
          entry,
          target: "node",
          cache: false,
          incremental: false,
          devtool: false,
          experiments: { useInputFileSystem: [/.*/] },
          externalsPresets: { node: false },
          externals: policy.externals,
          plugins: options.rejectUnsupported === false ? [] : [policy.plugin],
          module: {
            parser: {
              javascript: {
                ...(options.requireResolve === undefined
                  ? {}
                  : { requireResolve: options.requireResolve }),
                ...(options.requireAsExpression === undefined
                  ? {}
                  : { requireAsExpression: options.requireAsExpression }),
              },
            },
            rules: [
              {
                test: /\.[cm]?js$/,
                type: "javascript/auto",
                resolve: { fullySpecified: false },
              },
            ],
          },
          resolve: {
            tsConfig: { configFile },
            extensions: [".js", ".json", ".cjs", ".mjs"],
            mainFields: ["main"],
            conditionNames: [...conditions],
            byDependency: {
              esm: {
                conditionNames: ["import", ...conditions],
                fullySpecified: false,
              },
              commonjs: { conditionNames: ["require", ...conditions] },
            },
          },
          optimization: { minimize: false, nodeEnv: false },
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
  });
  const capture = yield* policy.capture;
  const native = yield* recording.capture;
  const validate = inputs.check.pipe(
    Effect.andThen(native.validate),
    Effect.andThen(inputs.check),
  );
  yield* validate;
  return {
    ...capture,
    validate,
    native,
    graph: Array.from(completed.compilation.modules, (module) => ({
      file: module.nameForCondition(),
      dependencies: dependencies(module),
    })),
    url: pathToFileURL(path.join(output, "entry.mjs")).href,
    code: yield* fs.readFileString(path.join(output, "entry.mjs")),
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

const oracle = Effect.fn("RspackExternalsTest.oracle")(
  function* (entry: string) {
    const prepared = yield* Bundler.compile(entry);
    return yield* load(prepared.url);
  },
  Effect.provide(Compilation.layer({ mode: "Once", ownedDirectories: [] })),
);

layer(NodeServices.layer, { excludeTestServices: true })(
  "Rspack external dependency policy",
  (it) => {
    it.effect(
      "keeps a capture with pending resolutions permanently invalid",
      () =>
        Effect.gen(function* () {
          const { root, file } = yield* fixture({
            "entry.js": "export {};",
            "helper.js": "export {};",
          });
          const inputs = yield* CompilationInputs.make("Once", ["node"]);
          const policy = yield* RspackExternals.make({
            inputs,
            conditions: ["node"],
          });
          const entered = yield* Deferred.make<void>();
          const release = yield* Deferred.make<string>();
          const services = yield* Effect.context<never>();
          const externals = policy.externals;
          assert(typeof externals === "function");
          const pending = externals(
            {
              context: root,
              request: "./helper.js",
              dependencyType: "esm",
              contextInfo: { issuer: file("entry.js") },
              getResolve: () => () =>
                Effect.runPromiseWith(services)(
                  Deferred.succeed(entered, undefined).pipe(
                    Effect.andThen(Deferred.await(release)),
                  ),
                ),
            },
            () => {},
          );
          yield* Deferred.await(entered);
          const first = yield* policy.capture.pipe(Effect.result);
          assert(Result.isFailure(first));
          expect(first.failure).toMatchObject({ reason: "PendingResolutions" });
          yield* Deferred.succeed(release, file("helper.js"));
          yield* Effect.promise(() => Promise.resolve(pending));
          const second = yield* policy.capture.pipe(Effect.result);
          assert(Result.isFailure(second));
          expect(second.failure).toMatchObject({
            reason: "PendingResolutions",
          });
        }).pipe(Effect.scoped),
    );
    it.effect(
      "disabling require.resolve alone creates a context and preserving the free require also drops target evidence",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const { file } = yield* fixture({
            "entry.js":
              'import { createRequire } from "node:module"; globalThis.require = createRequire(import.meta.url); export const probe = () => require.resolve("dependency");',
            "node_modules/dependency/package.json": '{"main":"./index.cjs"}',
            "node_modules/dependency/index.cjs": 'module.exports = "original";',
            "node_modules/dependency/other.cjs": 'module.exports = "changed";',
          });
          const evaluate = (url: string) =>
            Runner.evaluateNative({
              _tag: "Native",
              url,
              exportName: "probe",
              invoke: true,
            });
          const baseline = yield* Bundler.compile(file("entry.js")).pipe(
            Effect.provide(
              Compilation.layer({ mode: "Once", ownedDirectories: [] }),
            ),
          );
          const parsed = yield* compile(file("entry.js"), {
            rejectUnsupported: false,
          });
          const disabled = yield* compile(file("entry.js"), {
            requireResolve: false,
          });
          const preserved = yield* compile(file("entry.js"), {
            requireResolve: false,
            requireAsExpression: false,
          });
          expect(yield* evaluate(pathToFileURL(file("entry.js")).href)).toBe(
            file("node_modules/dependency/index.cjs"),
          );
          expect(yield* evaluate(baseline.url)).toBe(
            file("node_modules/dependency/index.cjs"),
          );
          expect(yield* evaluate(parsed.url)).toBe("dependency");
          expect(
            Object.values(baseline.metafile.inputs)
              .flatMap((input) => input.imports)
              .some(
                (dependency) =>
                  dependency.path === "dependency" ||
                  dependency.path.includes("node_modules/dependency"),
              ),
          ).toBe(false);
          const disabledResult = yield* evaluate(disabled.url).pipe(
            Effect.result,
          );
          assert(Result.isFailure(disabledResult));
          expect(disabledResult.failure.message).toContain(
            "Cannot find module 'dependency'",
          );
          expect(
            disabled.graph
              .flatMap((module) => module.dependencies)
              .some((dependency) => dependency.type.includes("context")),
          ).toBe(true);
          expect(yield* evaluate(preserved.url)).toBe(
            file("node_modules/dependency/index.cjs"),
          );
          expect(
            parsed.graph.flatMap((module) => module.dependencies),
          ).toContainEqual({ type: "require.resolve", request: "dependency" });
          expect(
            disabled.graph
              .flatMap((module) => module.dependencies)
              .some((dependency) =>
                dependency.type.startsWith("require.resolve"),
              ),
          ).toBe(false);
          expect(parsed.observations).toEqual([
            expect.objectContaining({
              physical: file("node_modules/dependency/index.cjs"),
            }),
          ]);
          expect(
            parsed.native.observations.some(
              (observation) =>
                observation.path ===
                file("node_modules/dependency/package.json"),
            ),
          ).toBe(true);
          for (const preparation of [disabled, preserved]) {
            expect(preparation.observations).toEqual([]);
            expect(
              preparation.native.observations.some((observation) =>
                observation.path.includes("node_modules/dependency"),
              ),
            ).toBe(false);
          }
          expect(preserved.reusable).toBe(true);
          yield* fs.writeFileString(
            file("node_modules/dependency/package.json"),
            '{"main":"./other.cjs"}',
          );
          yield* preserved.validate;
          const changedParsed = yield* parsed.validate.pipe(Effect.result);
          assert(Result.isFailure(changedParsed));
          expect(changedParsed.failure._tag).toBe("CompilationRestartRequired");
          expect(yield* evaluate(preserved.url)).toBe(
            file("node_modules/dependency/other.cjs"),
          );
          expect(yield* evaluate(baseline.url)).toBe(
            file("node_modules/dependency/other.cjs"),
          );
        }).pipe(Effect.scoped),
    );

    it.effect(
      "preserving a free require matches the oracle's entry-rooted global policy despite a different nested package version",
      () =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "entry.js":
              'import { createRequire } from "node:module"; import { read } from "./nested/index.js"; globalThis.require = createRequire(import.meta.url); export const probe = () => read();',
            "nested/index.js":
              'export const read = () => require.resolve("dependency");',
            "node_modules/dependency/package.json":
              '{"version":"1.0.0","main":"./index.cjs"}',
            "node_modules/dependency/index.cjs": 'module.exports = "entry-v1";',
            "nested/node_modules/dependency/package.json":
              '{"version":"2.0.0","main":"./index.cjs"}',
            "nested/node_modules/dependency/index.cjs":
              'module.exports = "nested-v2";',
          });
          const evaluate = (url: string) =>
            Runner.evaluateNative({
              _tag: "Native",
              url,
              exportName: "probe",
              invoke: true,
            });
          const baseline = yield* Bundler.compile(file("entry.js")).pipe(
            Effect.provide(
              Compilation.layer({ mode: "Once", ownedDirectories: [] }),
            ),
          );
          const disabled = yield* compile(file("entry.js"), {
            requireResolve: false,
          });
          const preserved = yield* compile(file("entry.js"), {
            requireResolve: false,
            requireAsExpression: false,
          });
          expect(yield* evaluate(pathToFileURL(file("entry.js")).href)).toBe(
            file("node_modules/dependency/index.cjs"),
          );
          expect(yield* evaluate(baseline.url)).toBe(
            file("node_modules/dependency/index.cjs"),
          );
          const disabledResult = yield* evaluate(disabled.url).pipe(
            Effect.result,
          );
          assert(Result.isFailure(disabledResult));
          expect(disabledResult.failure.message).toContain(
            "Cannot find module 'dependency'",
          );
          expect(yield* evaluate(preserved.url)).toBe(
            file("node_modules/dependency/index.cjs"),
          );
          expect(
            Object.values(baseline.metafile.inputs)
              .flatMap((input) => input.imports)
              .some(
                (dependency) =>
                  dependency.path === "dependency" ||
                  dependency.path.includes("node_modules/dependency"),
              ),
          ).toBe(false);
          expect(
            disabled.graph
              .flatMap((module) => module.dependencies)
              .some((dependency) =>
                dependency.type.startsWith("require.resolve"),
              ),
          ).toBe(false);
          expect(preserved.observations).toEqual([]);
          expect(
            preserved.native.observations.some((observation) =>
              observation.path.includes("node_modules/dependency"),
            ),
          ).toBe(false);
        }).pipe(Effect.scoped),
    );

    it.effect(
      "preserves a named local createRequire.resolve at its nested source location with default and disabled parsing",
      () =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "entry.js":
              'import { createRequire } from "node:module"; import { read } from "./nested/index.js"; globalThis.require = createRequire(import.meta.url); export const probe = () => read();',
            "nested/index.js":
              'import { createRequire } from "node:module"; const localRequire = createRequire(import.meta.url); export const read = () => localRequire.resolve("dependency");',
            "node_modules/dependency/package.json":
              '{"version":"1.0.0","main":"./index.cjs"}',
            "node_modules/dependency/index.cjs": 'module.exports = "entry-v1";',
            "nested/node_modules/dependency/package.json":
              '{"version":"2.0.0","main":"./index.cjs"}',
            "nested/node_modules/dependency/index.cjs":
              'module.exports = "nested-v2";',
          });
          const evaluate = (url: string) =>
            Runner.evaluateNative({
              _tag: "Native",
              url,
              exportName: "probe",
              invoke: true,
            });
          const baseline = yield* Bundler.compile(file("entry.js")).pipe(
            Effect.provide(
              Compilation.layer({ mode: "Once", ownedDirectories: [] }),
            ),
          );
          const defaultParsing = yield* compile(file("entry.js"));
          const disabled = yield* compile(file("entry.js"), {
            requireResolve: false,
          });
          for (const url of [
            pathToFileURL(file("entry.js")).href,
            baseline.url,
            defaultParsing.url,
            disabled.url,
          ])
            expect(yield* evaluate(url)).toBe(
              file("nested/node_modules/dependency/index.cjs"),
            );
          for (const prepared of [defaultParsing, disabled]) {
            expect(
              prepared.graph
                .flatMap((module) => module.dependencies)
                .some((dependency) =>
                  dependency.type.startsWith("require.resolve"),
                ),
            ).toBe(false);
            expect(prepared.observations).toEqual([]);
            expect(
              prepared.native.observations.some((observation) =>
                observation.path.includes("node_modules/dependency"),
              ),
            ).toBe(false);
          }
        }).pipe(Effect.scoped),
    );

    it.effect("seals completed observations before returning them", () =>
      Effect.gen(function* () {
        const { file } = yield* fixture({ "entry.js": "export {};" });
        const inputs = yield* CompilationInputs.make("Once", ["node"]);
        const policy = yield* RspackExternals.make({
          inputs,
          conditions: ["node"],
        });
        const capture = yield* policy.capture;
        const externals = policy.externals;
        assert(typeof externals === "function");
        const result = yield* Effect.tryPromise({
          try: () =>
            Promise.resolve(
              externals(
                {
                  request: "node:path",
                  dependencyType: "esm",
                  contextInfo: { issuer: file("entry.js") },
                },
                () => {},
              ),
            ),
          catch: (cause) => new Failed({ cause }),
        }).pipe(Effect.result);
        assert(Result.isFailure(result));
        expect(String(result.failure.cause)).toContain("Sealed");
        expect(capture.observations).toEqual([]);
        expect((yield* policy.capture).observations).toBe(capture.observations);
        expect(capture.reusable).toBe(true);
      }).pipe(Effect.scoped),
    );

    it.effect(
      "rejects require.resolve rather than returning Rspack module IDs as Node paths",
      () =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "entry.js": 'export const probe = require.resolve("dependency");',
            "node_modules/dependency/package.json": '{"main":"./index.cjs"}',
            "node_modules/dependency/index.cjs":
              'module.exports = "require-only";',
          });
          const baseline = yield* oracle(file("entry.js"));
          const unguarded = yield* compile(file("entry.js"), {
            rejectUnsupported: false,
          });
          expect(baseline.probe).toBe(
            file("node_modules/dependency/index.cjs"),
          );
          expect((yield* load(unguarded.url)).probe).toBe("dependency");
          const rejected = yield* compile(file("entry.js")).pipe(Effect.result);
          assert(Result.isFailure(rejected));
          assert(Schema.is(Failed)(rejected.failure));
          expect(String(rejected.failure.cause)).toContain("RequireResolve");
        }).pipe(Effect.scoped),
    );

    it.effect(
      "keeps require-only dynamic imports deferred with the oracle's native failure",
      () =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "entry.js":
              'export const probe = () => import("dependency").then(() => "loaded", () => "failed");',
            "node_modules/dependency/package.json":
              '{"exports":{"require":"./index.cjs"}}',
            "node_modules/dependency/index.cjs":
              'module.exports = "require-only";',
          });
          const baseline = yield* Bundler.compile(file("entry.js")).pipe(
            Effect.provide(
              Compilation.layer({ mode: "Once", ownedDirectories: [] }),
            ),
          );
          const candidate = yield* compile(file("entry.js"));
          const evaluate = (url: string) =>
            Runner.evaluateNative({
              _tag: "Native",
              url,
              exportName: "probe",
              invoke: true,
            });
          expect(yield* evaluate(candidate.url)).toBe(
            yield* evaluate(baseline.url),
          );
          expect(yield* evaluate(candidate.url)).toBe("failed");
          expect(candidate.observations).toEqual([
            expect.objectContaining({
              physical: file("node_modules/dependency/index.cjs"),
              emitted: "dependency",
            }),
          ]);
          expect(candidate.reusable).toBe(false);
        }).pipe(Effect.scoped),
    );

    it.effect(
      "preserves import, require and custom export conditions with relocated exact targets",
      () =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "entry.js":
              'import imported from "conditional"; const required = require("conditional"); export const probe = [imported, required];',
            "node_modules/conditional/package.json":
              '{"type":"module","exports":{"import":{"custom":"./custom.mjs","default":"./import.mjs"},"require":"./require.cjs"}}',
            "node_modules/conditional/custom.mjs": 'export default "custom";',
            "node_modules/conditional/import.mjs": 'export default "import";',
            "node_modules/conditional/require.cjs":
              'module.exports = "require";',
          });
          const baseline = yield* oracle(file("entry.js"));
          const prepared = yield* compile(file("entry.js"));
          expect((yield* load(prepared.url)).probe).toEqual(baseline.probe);
          expect(baseline.probe).toEqual(["custom", "require"]);
          expect(
            prepared.observations.map((item) => item.physical).sort(),
          ).toEqual([
            file("node_modules/conditional/custom.mjs"),
            file("node_modules/conditional/require.cjs"),
          ]);
          expect(prepared.reusable).toBe(false);
          expect(prepared.code).not.toContain('export default "custom"');
        }).pipe(
          Effect.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({
                NODE_OPTIONS: "--conditions=custom",
              }),
            ),
          ),
          Effect.scoped,
        ),
    );

    it.effect(
      "preserves third-party singleton identity and hashes original external bytes",
      () =>
        Effect.gen(function* () {
          const source = "module.exports = {};";
          const { file } = yield* fixture({
            "entry.js":
              'import singleton from "singleton"; export { singleton };',
            "node_modules/singleton/package.json": '{"main":"./index.cjs"}',
            "node_modules/singleton/index.cjs": source,
          });
          const native: unknown = createRequire(file("entry.js"))("singleton");
          const baseline = yield* oracle(file("entry.js"));
          const first = yield* compile(file("entry.js"));
          const second = yield* compile(file("entry.js"));
          expect((yield* load(first.url)).singleton).toBe(native);
          expect((yield* load(second.url)).singleton).toBe(native);
          expect(baseline.singleton).toBe(native);
          expect(first.observations).toEqual([
            expect.objectContaining({
              importer: file("entry.js"),
              request: "singleton",
              physical: file("node_modules/singleton/index.cjs"),
              emitted: pathToFileURL(file("node_modules/singleton/index.cjs"))
                .href,
              sha256:
                "1cf3e1eeed2d717d4dba8a101c28b71f65e908beb02f90371b11f927125b8390",
            }),
          ]);
        }).pipe(Effect.scoped),
    );

    it.effect(
      "keeps importer-relative nested dependency targets instead of resolving from the output",
      () =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "entry.js":
              'import left from "dependency"; import right from "./nested/index.js"; export const probe = [left, right];',
            "nested/index.js": 'export { default } from "dependency";',
            "node_modules/dependency/package.json":
              '{"type":"module","exports":{"import":"./index.js"}}',
            "node_modules/dependency/index.js": 'export default "root";',
            "nested/node_modules/dependency/package.json":
              '{"type":"module","exports":{"import":"./index.js"}}',
            "nested/node_modules/dependency/index.js":
              'export default "nested";',
          });
          const baseline = yield* oracle(file("entry.js"));
          const prepared = yield* compile(file("entry.js"));
          expect((yield* load(prepared.url)).probe).toEqual(baseline.probe);
          expect(baseline.probe).toEqual(["root", "nested"]);
          expect(
            prepared.observations.map((item) => item.physical).sort(),
          ).toEqual([
            file("nested/node_modules/dependency/index.js"),
            file("node_modules/dependency/index.js"),
          ]);
        }).pipe(Effect.scoped),
    );

    it.effect(
      "bundles physical workspace symlinks and leaves builtins external",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const { file } = yield* fixture({
            "entry.js":
              'import value from "workspace"; import { basename } from "node:path"; const { sep } = require("path"); export const probe = [value, basename("one/two"), sep];',
            "workspace/package.json":
              '{"type":"module","exports":{"import":"./index.js"}}',
            "workspace/index.js": 'export { default } from "./inner";',
            "workspace/inner.js": 'export default "workspace";',
            "node_modules/.keep": "",
          });
          yield* fs.symlink(file("workspace"), file("node_modules/workspace"));
          const baseline = yield* oracle(file("entry.js"));
          const prepared = yield* compile(file("entry.js"));
          expect((yield* load(prepared.url)).probe).toEqual(baseline.probe);
          expect(prepared.code).toContain('"workspace"');
          expect(prepared.observations).toEqual([]);
          expect(prepared.reusable).toBe(true);
        }).pipe(Effect.scoped),
    );

    it.effect(
      "does not turn a tsconfig alias into the runtime external target",
      () =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "tsconfig.json":
              '{"compilerOptions":{"paths":{"dependency":["./node_modules/alias/index.js"]}}}',
            "entry.js": 'export { default as probe } from "dependency";',
            "node_modules/alias/package.json": '{"type":"module"}',
            "node_modules/alias/index.js": 'export default "alias";',
            "node_modules/dependency/package.json":
              '{"type":"module","exports":"./index.js"}',
            "node_modules/dependency/index.js": 'export default "runtime";',
          });
          const baseline = yield* oracle(file("entry.js"));
          const prepared = yield* compile(file("entry.js"));
          expect((yield* load(prepared.url)).probe).toBe("runtime");
          expect(baseline.probe).toBe("runtime");
          expect(prepared.observations).toEqual([
            expect.objectContaining({
              physical: file("node_modules/dependency/index.js"),
            }),
          ]);
        }).pipe(Effect.scoped),
    );

    it.effect.each(["metadata", "shadow", "bytes"] as const)(
      "requires restart after external %s changes",
      (change) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const { file } = yield* fixture({
            "nested/entry.js": 'export { default as probe } from "dependency";',
            "node_modules/dependency/package.json":
              '{"type":"module","exports":"./one.js"}',
            "node_modules/dependency/one.js": 'export default "one";',
            "node_modules/dependency/two.js": 'export default "two";',
          });
          const prepared = yield* compile(file("nested/entry.js"));
          const published = yield* Schema.encodeEffect(
            Schema.fromJsonString(Schema.Unknown),
          )(prepared.observations);
          if (change === "metadata")
            yield* fs.writeFileString(
              file("node_modules/dependency/package.json"),
              '{"type":"module","exports":"./two.js"}',
            );
          if (change === "bytes")
            yield* fs.writeFileString(
              file("node_modules/dependency/one.js"),
              'export default "two";',
            );
          if (change === "shadow") {
            yield* fs.makeDirectory(file("nested/node_modules/dependency"), {
              recursive: true,
            });
            yield* fs.writeFileString(
              file("nested/node_modules/dependency/package.json"),
              '{"type":"module","exports":"./index.js"}',
            );
            yield* fs.writeFileString(
              file("nested/node_modules/dependency/index.js"),
              'export default "shadow";',
            );
          }
          const result = yield* prepared.validate.pipe(Effect.result);
          assert(Result.isFailure(result));
          expect(result.failure._tag).toBe("CompilationRestartRequired");
          expect(
            yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(
              prepared.observations,
            ),
          ).toBe(published);
        }).pipe(Effect.scoped),
    );

    it.effect(
      "rejects PnP discovery before evaluating the project loader",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const { file } = yield* fixture({
            "entry.js": "export const probe = true;",
            ".pnp.cjs": 'throw new Error("PnP loader must never execute");',
          });
          const reads: string[] = [];
          const observed = {
            ...fs,
            readFile: (name: string) => {
              reads.push(name);
              return fs.readFile(name);
            },
            readFileString: (name: string) => {
              reads.push(name);
              return fs.readFileString(name);
            },
          };
          const result = yield* compile(file("entry.js")).pipe(
            Effect.provideService(FileSystem.FileSystem, observed),
            Effect.result,
          );
          assert(Result.isFailure(result));
          expect(result.failure).toMatchObject({
            _tag: "RspackExternalsUnsupported",
            reason: "PnpProject",
            path: file(".pnp.cjs"),
          });
          expect(reads).not.toContain(file(".pnp.cjs"));
        }).pipe(Effect.scoped),
    );
  },
);
