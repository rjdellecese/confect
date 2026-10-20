import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, expect, layer } from "@effect/vitest";
import { rspack, type Compiler, type Module, type Stats } from "@rspack/core";
import { createRequire } from "node:module";
import { isBuiltin } from "node:module";
import type { ExternalItemFunctionData, ResolveOptions } from "@rspack/core";
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
import * as RspackCompiler from "../../src/RspackCompiler.ts";
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

interface NativeProbe {
  readonly request: string;
  readonly importer: string;
  readonly native: string | undefined;
  readonly required: string | undefined;
  readonly imported: string | undefined;
  readonly physical: string | undefined;
  readonly emitted: string | undefined;
  readonly errors: ReadonlyArray<string>;
}

const nativeProbe = Effect.fn("RspackExternalsTest.nativeProbe")(function* (
  entry: string,
  api: "getResolve" | "factory",
  options: {
    readonly fullySpecified?: boolean;
    readonly requireFullySpecified?: boolean;
    readonly exact?: boolean;
    readonly metadataProbe?: boolean;
    readonly allRequests?: boolean;
    readonly tsconfig?: string;
  } = {},
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const conditions = yield* NodeConditions.current;
  const output = yield* fs.makeTempDirectoryScoped({
    directory: path.dirname(entry),
    prefix: ".confect-artifacts-native-probe-",
  });
  const emptyConfig = path.join(output, "tsconfig.json");
  yield* fs.writeFileString(emptyConfig, "{}");
  const recording = RspackInputs.make();
  const probes: NativeProbe[] = [];
  const files = new Set<string>();
  const missing = new Set<string>();
  const descriptions: Array<{
    mode: string;
    request: string;
    path: string;
    descriptionFilePath: string | undefined;
    descriptionFileData: unknown;
  }> = [];
  const services = yield* Effect.context<never>();
  const resolveOptions = (mode: "import" | "require"): ResolveOptions => ({
    alias: false,
    fallback: false,
    aliasFields: [],
    extensionAlias: {},
    tsConfig: { configFile: emptyConfig },
    mainFields: ["main"],
    mainFiles: options.exact ? [] : ["index"],
    extensions: options.exact ? [] : [".js", ".json", ".node"],
    conditionNames: [mode, ...conditions],
    fullySpecified:
      mode === "import"
        ? options.fullySpecified === true
        : options.requireFullySpecified === true,
    symlinks: true,
    modules: ["node_modules"],
    preferRelative: false,
    preferAbsolute: false,
    exportsFields: ["exports"],
    importsFields: ["imports"],
    byDependency: {},
  });
  const resolve = (
    data: ExternalItemFunctionData,
    mode: "import" | "require",
    overrides: ResolveOptions = {},
  ): Promise<string | undefined> =>
    Effect.runPromiseWith(services)(
      Effect.callback<string | undefined, Failed>((resume) => {
        const { context, request, getResolve } = data;
        assert(context && request && getResolve);
        const callback = (
          error: Error | null,
          result?: string | false,
          resolved?: {
            path: string;
            descriptionFilePath?: string;
            descriptionFileData?: unknown;
          },
        ) => {
          if (resolved)
            descriptions.push({
              mode,
              request,
              path: resolved.path,
              descriptionFilePath: resolved.descriptionFilePath,
              descriptionFileData: resolved.descriptionFileData,
            });
          resume(
            error
              ? Effect.fail(new Failed({ cause: error }))
              : Effect.succeed(resolved?.path ?? (result || undefined)),
          );
        };
        if (api === "getResolve")
          getResolve({ ...resolveOptions(mode), ...overrides })(
            context,
            request,
            callback,
          );
        else
          engine.resolverFactory
            .get("normal", {
              ...resolveOptions(mode),
              ...overrides,
              dependencyType: mode === "import" ? "esm" : "commonjs",
            })
            .resolve(
              {},
              context,
              request,
              { fileDependencies: files, missingDependencies: missing },
              callback,
            );
      }),
    );
  const engine = yield* Effect.acquireRelease(
    Effect.try({
      try: () =>
        rspack({
          context: path.dirname(entry),
          entry,
          mode: "development",
          target: "node",
          cache: false,
          incremental: false,
          devtool: false,
          experiments: { useInputFileSystem: [/.*/] },
          externalsPresets: { node: false },
          externals: (data) =>
            Effect.runPromiseWith(services)(
              Effect.gen(function* () {
                const { request, context, getResolve } = data;
                const importer = data.contextInfo?.issuer;
                if (!request || !context || !getResolve || !importer) return;
                const commonjs = data.dependencyType === "commonjs";
                if (isBuiltin(request))
                  return `${commonjs ? "node-commonjs" : "module-import"} ${request}`;
                const errors: string[] = [];
                const attempt = (work: Promise<string | undefined>) =>
                  Effect.tryPromise({
                    try: () => work,
                    catch: (cause) => new Failed({ cause }),
                  }).pipe(
                    Effect.catch((error) =>
                      Effect.sync(() => {
                        errors.push(String(error.cause));
                        return undefined;
                      }),
                    ),
                  );
                const native = yield* attempt(getResolve()(context, request));
                if (
                  !options.allRequests &&
                  native &&
                  !/[\\/]node_modules[\\/]/.test(native)
                )
                  return;
                if (
                  native &&
                  (request.startsWith(".") || path.isAbsolute(request)) &&
                  !/[\\/]node_modules[\\/]/.test(request)
                )
                  return;
                const bare =
                  !request.startsWith(".") &&
                  !request.startsWith("#") &&
                  !path.isAbsolute(request);
                if (!options.allRequests && !native && !bare) return;
                if (options.metadataProbe && bare) {
                  const packageName = request
                    .split("/")
                    .slice(0, request.startsWith("@") ? 2 : 1)
                    .join("/");
                  yield* attempt(
                    resolve(
                      { ...data, request: `${packageName}/package.json` },
                      "require",
                      { exportsFields: [], extensions: [], mainFiles: [] },
                    ),
                  );
                }
                const required = yield* attempt(resolve(data, "require"));
                const imported = yield* attempt(resolve(data, "import"));
                const physical =
                  !native && !required
                    ? undefined
                    : !required && !imported
                      ? undefined
                      : ((commonjs || !native ? required : imported) ?? native);
                const emitted = !physical
                  ? undefined
                  : commonjs
                    ? physical
                    : native && imported
                      ? pathToFileURL(imported).href
                      : request;
                probes.push({
                  request,
                  importer,
                  native,
                  required,
                  imported,
                  physical,
                  emitted,
                  errors,
                });
                return emitted
                  ? `${commonjs ? "node-commonjs" : "module-import"} ${emitted}`
                  : undefined;
              }),
            ),
          module: {
            rules: [
              {
                test: /\.[cm]?js$/,
                type: "javascript/auto",
                resolve: { fullySpecified: false },
              },
            ],
          },
          resolve: {
            ...(options.tsconfig
              ? { tsConfig: { configFile: options.tsconfig } }
              : {}),
            extensions: [".js", ".json", ".cjs", ".mjs"],
            mainFields: ["main"],
            conditionNames: [...conditions],
            byDependency: {
              esm: { conditionNames: ["import", ...conditions] },
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
        cause || !stats
          ? Effect.fail(new Failed({ cause }))
          : Effect.succeed(stats),
      ),
    );
  });
  const capture = yield* recording.capture;
  return {
    probes,
    descriptions,
    capture,
    files: [...files],
    missing: [...missing],
    compilationFiles: [...completed.compilation.fileDependencies],
    compilationMissing: [...completed.compilation.missingDependencies],
    errors: completed.hasErrors()
      ? completed.toString({ all: false, errors: true })
      : undefined,
    url: pathToFileURL(path.join(output, "entry.mjs")).href,
  };
});

layer(NodeServices.layer, { excludeTestServices: true })(
  "Rspack supported native runtime resolver probes",
  (it) => {
    it.effect.each(["getResolve", "factory"] as const)(
      "%s reveals manifest-free shadow and self-reference metadata ambiguity",
      (api) =>
        Effect.gen(function* () {
          const shadow = yield* fixture({
            "nested/entry.js": 'export {default as probe} from "dependency";',
            "nested/node_modules/dependency/index.js":
              'module.exports="shadow";',
            "node_modules/dependency/package.json": '{"exports":"./index.js"}',
            "node_modules/dependency/index.js": 'module.exports="ancestor";',
          });
          const shadowed = yield* nativeProbe(
            shadow.file("nested/entry.js"),
            api,
            { metadataProbe: true },
          );
          expect(shadowed.probes[0]?.physical).toBe(
            shadow.file("nested/node_modules/dependency/index.js"),
          );
          expect(shadowed.descriptions).toContainEqual(
            expect.objectContaining({
              request: "dependency/package.json",
              path: shadow.file("node_modules/dependency/package.json"),
            }),
          );
          const self = yield* fixture({
            "package.json": '{"name":"dependency","exports":"./local.js"}',
            "entry.js": 'export {default as probe} from "dependency";',
            "local.js": 'module.exports="self";',
            "node_modules/dependency/package.json": '{"exports":"./index.js"}',
            "node_modules/dependency/index.js": 'module.exports="installed";',
          });
          const referenced = yield* nativeProbe(self.file("entry.js"), api, {
            metadataProbe: true,
            allRequests: true,
          });
          expect(referenced.probes[0]?.physical).toBe(self.file("local.js"));
          expect(referenced.descriptions).toContainEqual(
            expect.objectContaining({
              request: "dependency/package.json",
              path: self.file("node_modules/dependency/package.json"),
            }),
          );
        }).pipe(Effect.scoped),
    );

    for (const api of ["getResolve", "factory"] as const) {
      it.effect.each(["shadow", "metadata", "symlink"] as const)(
        `${api} invalidates admitted exact targets after %s changes`,
        (change) =>
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const { file } = yield* fixture({
              "nested/entry.js": 'export {default as probe} from "dependency";',
              "node_modules/store-one/package.json": '{"exports":"./one.js"}',
              "node_modules/store-one/one.js": 'module.exports="one";',
              "node_modules/store-one/two.js": 'module.exports="two";',
              "node_modules/store-two/package.json": '{"exports":"./one.js"}',
              "node_modules/store-two/one.js": 'module.exports="retargeted";',
            });
            yield* fs.symlink(
              file("node_modules/store-one"),
              file("node_modules/dependency"),
            );
            const candidate = yield* nativeProbe(file("nested/entry.js"), api, {
              exact: true,
              metadataProbe: true,
            });
            expect(candidate.probes[0]?.physical).toBe(
              file("node_modules/store-one/one.js"),
            );
            expect(candidate.descriptions).toContainEqual(
              expect.objectContaining({
                request: "dependency/package.json",
                path: file("node_modules/store-one/package.json"),
              }),
            );
            expect(candidate.capture.observations).toContainEqual(
              expect.objectContaining({
                method: "lstat",
                path: file("node_modules/dependency"),
                fingerprint: expect.stringContaining(
                  file("node_modules/store-one"),
                ),
              }),
            );
            yield* candidate.capture.validate;
            if (change === "metadata")
              yield* fs.writeFileString(
                file("node_modules/store-one/package.json"),
                '{"exports":"./two.js"}',
              );
            if (change === "symlink") {
              yield* fs.remove(file("node_modules/dependency"));
              yield* fs.symlink(
                file("node_modules/store-two"),
                file("node_modules/dependency"),
              );
            }
            if (change === "shadow") {
              yield* fs.makeDirectory(file("nested/node_modules/dependency"), {
                recursive: true,
              });
              yield* fs.writeFileString(
                file("nested/node_modules/dependency/package.json"),
                '{"exports":"./index.js"}',
              );
              yield* fs.writeFileString(
                file("nested/node_modules/dependency/index.js"),
                'module.exports="shadow";',
              );
            }
            const changed = yield* candidate.capture.validate.pipe(
              Effect.result,
            );
            assert(Result.isFailure(changed));
            expect(changed.failure._tag).toBe("RspackInputsChanged");
          }).pipe(Effect.scoped),
      );
    }
    it.effect.each(["./main.js", "./main"])(
      "checks actual compiler placement for deferred require-only target %s",
      (target) =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "entry.js":
              'export const probe = () => import("dependency").then(() => "loaded", e => e.code);',
            "node_modules/dependency/package.json": `{"exports":{"require":"${target}"}}`,
            "node_modules/dependency/main.js": 'module.exports = "value";',
          });
          const baseline = yield* Bundler.compile(file("entry.js")).pipe(
            Effect.provide(
              Compilation.layer({ mode: "Once", ownedDirectories: [] }),
            ),
          );
          const evaluate = (url: string) =>
            Runner.evaluateNative({
              _tag: "Native",
              url,
              exportName: "probe",
              invoke: true,
            });
          expect(yield* evaluate(baseline.url)).toBe(
            "ERR_PACKAGE_PATH_NOT_EXPORTED",
          );
          const actual = yield* RspackCompiler.compile(file("entry.js")).pipe(
            Effect.result,
          );
          if (target === "./main.js") {
            assert(Result.isSuccess(actual));
            expect(yield* evaluate(actual.success.url)).toBe(
              "ERR_PACKAGE_PATH_NOT_EXPORTED",
            );
          } else {
            assert(Result.isFailure(actual));
            expect(actual.failure._tag).toBe(
              "RspackPrototypeCompilationFailed",
            );
          }
        }).pipe(Effect.scoped),
    );
    it.effect.each(["getResolve", "factory"] as const)(
      "%s keeps conditional targets, nested installs, aliases and workspace classification",
      (api) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const { file } = yield* fixture({
            "package.json":
              '{"name":"self","type":"module","exports":{"./local":"./local.js"},"imports":{"#local":"./local.js"}}',
            "tsconfig.json":
              '{"compilerOptions":{"paths":{"dependency":["./node_modules/alias/index.js"]}}}',
            "entry.js":
              'import dependency from "dependency"; import nested from "./nested/index.js"; import workspace from "workspace"; import self from "self/local"; import local from "#local"; import conditional from "conditional"; const required = require("conditional"); export const probe = [dependency,nested,workspace,self,local,conditional,required];',
            "local.js": 'export default "local";',
            "nested/index.js": 'export {default} from "dependency";',
            "node_modules/alias/package.json": '{"type":"module"}',
            "node_modules/alias/index.js": 'export default "alias";',
            "node_modules/dependency/package.json":
              '{"type":"module","exports":"./index.js"}',
            "node_modules/dependency/index.js": 'export default "runtime";',
            "nested/node_modules/dependency/package.json":
              '{"type":"module","exports":"./index.js"}',
            "nested/node_modules/dependency/index.js":
              'export default "nested";',
            "node_modules/conditional/package.json":
              '{"exports":{"import":{"custom":"./custom.js","default":"./import.js"},"require":"./require.js"}}',
            "node_modules/conditional/custom.js": 'module.exports = "custom";',
            "node_modules/conditional/import.js": 'module.exports = "import";',
            "node_modules/conditional/require.js":
              'module.exports = "require";',
            "workspace/package.json":
              '{"type":"module","exports":"./index.js"}',
            "workspace/index.js": 'export default "workspace";',
          });
          yield* fs.symlink(file("workspace"), file("node_modules/workspace"));
          const baseline = yield* oracle(file("entry.js"));
          const current = yield* compile(file("entry.js"));
          const candidate = yield* nativeProbe(file("entry.js"), api, {
            exact: true,
            tsconfig: file("tsconfig.json"),
          });
          expect(candidate.errors).toBeUndefined();
          const evaluated = yield* Runner.evaluateNative({
            _tag: "Native",
            url: candidate.url,
            exportName: "probe",
            invoke: false,
          });
          expect(evaluated).toEqual(baseline.probe);
          expect(evaluated).toEqual([
            "runtime",
            "nested",
            "workspace",
            "local",
            "local",
            "custom",
            "require",
          ]);
          expect(
            candidate.probes
              .filter(({ physical }) => physical)
              .map(({ physical, emitted }) => ({ physical, emitted }))
              .sort((a, b) =>
                (a.physical ?? "").localeCompare(b.physical ?? ""),
              ),
          ).toEqual(
            current.observations
              .map(({ physical, emitted }) => ({ physical, emitted }))
              .sort((a, b) => a.physical.localeCompare(b.physical)),
          );
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

    it.effect.each(["getResolve", "factory"] as const)(
      "%s exposes root metadata separately from misleading target metadata",
      (api) =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "entry.js": 'export {default as probe} from "dependency";',
            "node_modules/dependency/package.json":
              '{"exports":"./nested/value"}',
            "node_modules/dependency/nested/package.json": "{}",
            "node_modules/dependency/nested/value.js":
              'module.exports = "value";',
          });
          const candidate = yield* nativeProbe(file("entry.js"), api, {
            metadataProbe: true,
          });
          expect(candidate.descriptions).toContainEqual(
            expect.objectContaining({
              request: "dependency",
              descriptionFilePath: file("node_modules/dependency/nested"),
              descriptionFileData: {},
            }),
          );
          expect(candidate.descriptions).toContainEqual(
            expect.objectContaining({
              request: "dependency/package.json",
              path: file("node_modules/dependency/package.json"),
              descriptionFileData: { exports: "./nested/value" },
            }),
          );
          expect(candidate.capture.observations).toContainEqual(
            expect.objectContaining({
              method: "readFile",
              path: file("node_modules/dependency/package.json"),
            }),
          );
        }).pipe(Effect.scoped),
    );

    it.effect.each(["getResolve", "factory"] as const)(
      "%s cannot use permissive exports without changing singleton identity",
      (api) =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "entry.js":
              'import imported from "dependency"; const direct = require("./node_modules/dependency/main.js"); export const probe = imported === direct;',
            "node_modules/dependency/package.json": '{"exports":"./main"}',
            "node_modules/dependency/main.js": "module.exports = {};",
          });
          const current = yield* compile(file("entry.js"));
          const loose = yield* nativeProbe(file("entry.js"), api);
          const exact = yield* nativeProbe(file("entry.js"), api, {
            exact: true,
          });
          const evaluate = (url: string) =>
            Runner.evaluateNative({
              _tag: "Native",
              url,
              exportName: "probe",
              invoke: false,
            });
          expect(yield* evaluate(current.url)).toBe(false);
          expect(yield* evaluate(loose.url)).toBe(true);
          expect(yield* evaluate(exact.url)).toBe(false);
        }).pipe(Effect.scoped),
    );

    it.effect.each(["getResolve", "factory"] as const)(
      "%s observes failed runtime-only targets and invalidates later creation",
      (api) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const { file } = yield* fixture({
            "entry.js": 'export {default as probe} from "dependency";',
            "node_modules/dependency/package.json":
              '{"exports":{"import":"./index.js","require":"./missing.js"}}',
            "node_modules/dependency/index.js": 'module.exports = "value";',
          });
          const candidate = yield* nativeProbe(file("entry.js"), api, {
            exact: true,
          });
          expect(candidate.probes[0]?.required).toBeUndefined();
          expect(candidate.capture.observations).toContainEqual(
            expect.objectContaining({
              method: "stat",
              path: file("node_modules/dependency/missing.js"),
              fingerprint: expect.stringContaining("ENOENT"),
            }),
          );
          expect(candidate.files).not.toContain(
            file("node_modules/dependency/missing.js"),
          );
          expect(candidate.compilationMissing).not.toContain(
            file("node_modules/dependency/missing.js"),
          );
          yield* candidate.capture.validate;
          yield* fs.writeFileString(
            file("node_modules/dependency/missing.js"),
            'module.exports = "now present";',
          );
          const changed = yield* candidate.capture.validate.pipe(Effect.result);
          assert(Result.isFailure(changed));
          expect(changed.failure._tag).toBe("RspackInputsChanged");
        }).pipe(Effect.scoped),
    );

    it.effect.each(["getResolve", "factory"] as const)(
      "%s does not make explicit require.resolve a Node path",
      (api) =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "entry.js": 'export const probe = require.resolve("dependency");',
            "node_modules/dependency/package.json": '{"exports":"./main.js"}',
            "node_modules/dependency/main.js": 'module.exports = "value";',
          });
          const baseline = yield* oracle(file("entry.js"));
          const candidate = yield* nativeProbe(file("entry.js"), api, {
            exact: true,
          });
          expect(baseline.probe).toBe(file("node_modules/dependency/main.js"));
          expect(
            yield* Runner.evaluateNative({
              _tag: "Native",
              url: candidate.url,
              exportName: "probe",
              invoke: false,
            }),
          ).toBe("dependency");
        }).pipe(Effect.scoped),
    );

    it.effect.each(["getResolve", "factory"] as const)(
      "%s requires exact options for package imports targets",
      (api) =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "package.json": '{"imports":{"#local":"./local"}}',
            "entry.js": 'export const probe = require("#local");',
            "local.js": 'module.exports = "local";',
          });
          expect(() =>
            createRequire(file("entry.js")).resolve("#local"),
          ).toThrow();
          const loose = yield* nativeProbe(file("entry.js"), api, {
            allRequests: true,
          });
          const exact = yield* nativeProbe(file("entry.js"), api, {
            allRequests: true,
            exact: true,
          });
          expect(
            loose.probes.find(({ request }) => request === "#local")?.required,
          ).toBe(file("local.js"));
          expect(
            exact.probes.find(({ request }) => request === "#local")?.required,
          ).toBeUndefined();
        }).pipe(Effect.scoped),
    );

    it.effect.each(["getResolve", "factory"] as const)(
      "%s observes runtime-only positive and negative discovery",
      (api) =>
        Effect.gen(function* () {
          const { file } = yield* fixture({
            "entry.js": 'export { default as probe } from "dependency";',
            "node_modules/dependency/package.json":
              '{"exports":{"import":"./import.js","require":"./require"}}',
            "node_modules/dependency/import.js": 'module.exports = "import";',
            "node_modules/dependency/require.js": 'module.exports = "require";',
          });
          const candidate = yield* nativeProbe(file("entry.js"), api);
          expect(candidate.capture.observations).toContainEqual(
            expect.objectContaining({
              method: "stat",
              path: file("node_modules/dependency/require"),
              fingerprint: expect.stringContaining("ENOENT"),
            }),
          );
          expect(candidate.capture.observations).toContainEqual(
            expect.objectContaining({
              method: "stat",
              path: file("node_modules/dependency/require.js"),
            }),
          );
          expect(candidate.compilationFiles).not.toContain(
            file("node_modules/dependency/require.js"),
          );
          if (api === "factory") {
            expect(candidate.files).toContain(
              file("node_modules/dependency/require.js"),
            );
            expect(candidate.missing).toContain(
              file("node_modules/dependency/require"),
            );
          }
          expect(candidate.errors).toBeUndefined();
        }).pipe(Effect.scoped),
    );

    const cases: ReadonlyArray<{
      name: string;
      metadata: string;
      request: string;
      source: string;
      deferred?: boolean;
      extra?: Readonly<Record<string, string>>;
    }> = [
      {
        name: "query export",
        metadata: '{"exports":"./main.js?query"}',
        request: "dependency",
        source: "main.js",
        extra: {
          "node_modules/dependency/main.js?query": 'module.exports="literal";',
        },
      },
      {
        name: "hash export",
        metadata: '{"exports":"./main.js#hash"}',
        request: "dependency",
        source: "main.js",
        extra: {
          "node_modules/dependency/main.js#hash": 'module.exports="literal";',
        },
      },
      {
        name: "backslash export",
        metadata: '{"exports":"./nested\\\\main.js"}',
        request: "dependency",
        source: "nested/main.js",
        extra: {
          "node_modules/dependency/nested\\main.js":
            'module.exports="literal";',
        },
      },
      {
        name: "encoded request",
        metadata: '{"exports":{"./a%20b.js":"./main.js"}}',
        request: "dependency/a%20b.js",
        source: "main.js",
      },
      {
        name: "query request",
        metadata: '{"exports":{"./main.js":"./main.js"}}',
        request: "dependency/main.js?query",
        source: "main.js",
      },
      {
        name: "hash request",
        metadata: '{"exports":{"./main.js":"./main.js"}}',
        request: "dependency/main.js#hash",
        source: "main.js",
      },
      {
        name: "backslash request",
        metadata: "{}",
        request: "dependency\\\\main.js",
        source: "main.js",
      },
      {
        name: "encoded space export",
        metadata: '{"exports":"./a%20b.js"}',
        request: "dependency",
        source: "a%20b.js",
        extra: {
          "node_modules/dependency/a b.js": 'module.exports = "decoded";',
        },
      },
      {
        name: "encoded hash export",
        metadata: '{"exports":"./a%23b.js"}',
        request: "dependency",
        source: "a%23b.js",
        extra: {
          "node_modules/dependency/a#b.js": 'module.exports = "decoded";',
        },
      },
      {
        name: "nested manifest export",
        metadata: '{"exports":"./nested/value"}',
        request: "dependency",
        source: "nested/value.js",
        extra: { "node_modules/dependency/nested/package.json": "{}" },
      },
      {
        name: "manifest-free file package",
        metadata: "{}",
        request: "filepkg",
        source: "main.js",
        extra: { "node_modules/filepkg.js": 'module.exports = "value";' },
      },
      {
        name: "main extension",
        metadata: '{"main":"./main"}',
        request: "dependency",
        source: "main.js",
      },
      {
        name: "main directory",
        metadata: '{"main":"./main"}',
        request: "dependency",
        source: "main/index.js",
      },
      {
        name: "missing main index fallback",
        metadata: '{"main":"./missing"}',
        request: "dependency",
        source: "index.js",
      },
      {
        name: "no main index fallback",
        metadata: "{}",
        request: "dependency",
        source: "index.js",
      },
      {
        name: "legacy subpath extension",
        metadata: "{}",
        request: "dependency/main",
        source: "main.js",
      },
      {
        name: "legacy subpath directory",
        metadata: "{}",
        request: "dependency/main",
        source: "main/index.js",
      },
      {
        name: "exports exact",
        metadata: '{"exports":"./main.js"}',
        request: "dependency",
        source: "main.js",
      },
      {
        name: "exports extension",
        metadata: '{"exports":"./main"}',
        request: "dependency",
        source: "main.js",
      },
      {
        name: "exports directory",
        metadata: '{"exports":"./main"}',
        request: "dependency",
        source: "main/index.js",
      },
      {
        name: "exports missing fallback",
        metadata: '{"exports":["./missing.js","./main.js"]}',
        request: "dependency",
        source: "main.js",
      },
      {
        name: "exports invalid fallback",
        metadata: '{"exports":["invalid","./main.js"]}',
        request: "dependency",
        source: "main.js",
      },
      {
        name: "exports null fallback",
        metadata: '{"exports":[null,"./main.js"]}',
        request: "dependency",
        source: "main.js",
      },
      {
        name: "require-only deferred",
        metadata: '{"exports":{"require":"./main.js"}}',
        request: "dependency",
        source: "main.js",
        deferred: true,
      },
      {
        name: "require-only invalid deferred",
        metadata: '{"exports":{"require":"./main"}}',
        request: "dependency",
        source: "main.js",
        deferred: true,
      },
      {
        name: "import only",
        metadata: '{"exports":{"import":"./main.js"}}',
        request: "dependency",
        source: "main.js",
      },
      {
        name: "missing package",
        metadata: "{}",
        request: "missing-dependency",
        source: "main.js",
        deferred: true,
      },
    ];
    it.effect.each(cases)("$name", (testCase) =>
      Effect.gen(function* () {
        const { file } = yield* fixture({
          "entry.js": testCase.deferred
            ? `export const probe = () => import("${testCase.request}").then(m => m.default, e => e.code);`
            : `import value from "${testCase.request}"; export const probe = value;`,
          "node_modules/dependency/package.json": testCase.metadata,
          [`node_modules/dependency/${testCase.source}`]:
            'module.exports = "value";',
          ...testCase.extra,
        });
        const evaluate = (url: string) =>
          Runner.evaluateNative({
            _tag: "Native",
            url,
            exportName: "probe",
            invoke: testCase.deferred === true,
          }).pipe(Effect.result);
        const baseline = yield* Bundler.compile(file("entry.js")).pipe(
          Effect.provide(
            Compilation.layer({ mode: "Once", ownedDirectories: [] }),
          ),
          Effect.result,
        );
        const current = yield* compile(file("entry.js")).pipe(Effect.result);
        const alwaysFails = [
          "exports missing fallback",
          "missing package",
          "backslash request",
        ].includes(testCase.name);
        const inferredExport = [
          "exports extension",
          "exports directory",
          "nested manifest export",
        ].includes(testCase.name);
        const legacyMain = [
          "main extension",
          "main directory",
          "missing main index fallback",
          "no main index fallback",
        ].includes(testCase.name);
        const legacySubpath = testCase.name.startsWith("legacy subpath");
        const encodedTarget =
          testCase.name.startsWith("encoded ") &&
          testCase.name.endsWith(" export");
        const specialTarget = [
          "query export",
          "hash export",
          "backslash export",
        ].includes(testCase.name);
        const invalidDeferred =
          testCase.name === "require-only invalid deferred";
        expect(Result.isFailure(baseline)).toBe(
          inferredExport ||
            ["exports missing fallback", "backslash request"].includes(
              testCase.name,
            ),
        );
        expect(Result.isFailure(current)).toBe(alwaysFails || invalidDeferred);
        if (Result.isSuccess(baseline)) {
          const evaluated = yield* evaluate(baseline.success.url);
          if (legacySubpath || testCase.name === "manifest-free file package")
            assert(Result.isFailure(evaluated));
          else {
            assert(Result.isSuccess(evaluated));
            expect(evaluated.success).toBe(
              encodedTarget
                ? "decoded"
                : testCase.name === "missing package"
                  ? "ERR_MODULE_NOT_FOUND"
                  : testCase.deferred
                    ? "ERR_PACKAGE_PATH_NOT_EXPORTED"
                    : "value",
            );
          }
        }
        for (const api of ["getResolve", "factory"] as const) {
          for (const variant of [
            "legacy",
            "fullySpecified",
            "nodeLike",
            "exact",
          ] as const) {
            const candidate = yield* nativeProbe(file("entry.js"), api, {
              fullySpecified:
                variant === "fullySpecified" || variant === "nodeLike",
              requireFullySpecified: variant === "fullySpecified",
              exact: variant === "exact",
            });
            expect(candidate.errors !== undefined).toBe(
              alwaysFails || (invalidDeferred && variant === "exact"),
            );
            const targets = candidate.probes
              .filter(({ physical }) => physical)
              .map(({ physical, emitted }) => ({ physical, emitted }));
            if (Result.isSuccess(current)) {
              const policy = current.success.observations.map(
                ({ physical, emitted }) => ({ physical, emitted }),
              );
              const matches =
                encodedTarget ||
                specialTarget ||
                [
                  "manifest-free file package",
                  "query request",
                  "hash request",
                ].includes(testCase.name)
                  ? false
                  : inferredExport
                    ? variant === "exact"
                    : legacyMain
                      ? variant !== "exact"
                      : legacySubpath
                        ? variant === "nodeLike"
                        : true;
              if (matches)
                expect(targets, `${api}/${variant}/${testCase.name}`).toEqual(
                  policy,
                );
              else
                expect(
                  targets,
                  `${api}/${variant}/${testCase.name}`,
                ).not.toEqual(policy);
            }
            if (!candidate.errors) {
              const evaluated = yield* evaluate(candidate.url);
              if (specialTarget || (legacySubpath && variant === "nodeLike"))
                assert(Result.isFailure(evaluated));
              else {
                assert(Result.isSuccess(evaluated));
                expect(evaluated.success).toBe(
                  testCase.deferred ? "ERR_PACKAGE_PATH_NOT_EXPORTED" : "value",
                );
              }
            }
          }
        }
      }).pipe(Effect.scoped),
    );
  },
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
