import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Exit from "effect/Exit";
import * as Scope from "effect/Scope";
import { rspack, type Compiler, type Stats } from "@rspack/core";
import * as esbuild from "esbuild";
import * as CompilationInputs from "../../../packages/cli/src/CompilationInputs.ts";
import * as NodeConditions from "../../../packages/cli/src/NodeConditions.ts";
import * as RspackInputs from "./RspackInputs.ts";
import * as RspackGraph from "./RspackGraph.ts";
import * as RspackExternals from "./RspackExternals.ts";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import type * as CompilationConfig from "../../../packages/cli/src/CompilationConfig.ts";
import * as RspackOwnership from "./RspackOwnership.ts";
import * as RspackComponents from "./RspackComponents.ts";

export class Failed extends Schema.TaggedError<Failed>()(
  "RspackPrototypeCompilationFailed",
  {
    stage: Schema.String,
    path: Schema.String,
    cause: Schema.Unknown,
    observations: Schema.optionalKey(Schema.Array(RspackInputs.Observation)),
  },
) {
  override get message() {
    return `${this.stage} failed for ${this.path}: ${String(this.cause)}`;
  }
}

class UnsupportedAttributes extends Schema.TaggedError<UnsupportedAttributes>()(
  "RspackPrototypeUnsupportedAttributes",
  {
    path: Schema.String,
    attributes: Schema.Record(Schema.String, Schema.String),
  },
) {
  override get message() {
    return `Unsupported import attributes for ${this.path}: ${JSON.stringify(this.attributes)}`;
  }
}

const run = (
  compiler: Compiler,
  entry: string,
  changes?: Parameters<Compiler["run"]>[1],
) =>
  Effect.callback<Stats, Failed>((resume) => {
    compiler.run((cause, stats) => {
      if (cause || !stats || stats.hasErrors()) {
        resume(
          Effect.fail(
            new Failed({
              stage: "build",
              path: entry,
              cause:
                cause ??
                stats?.toString({ all: false, errors: true }) ??
                "Missing build result",
            }),
          ),
        );
      } else resume(Effect.succeed(stats));
    }, changes);
  });

export const make = Effect.fn("RspackPrototype.make")(function* (
  entries: ReadonlyArray<string>,
  options?: {
    readonly inputs: CompilationInputs.Inputs;
    readonly conditions: ReadonlyArray<string>;
    readonly configuration?: CompilationConfig.Discovery;
    readonly ownership?: RspackOwnership.Options;
    readonly profile?: "modules" | "component-config";
  },
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const entry = entries[0];
  if (!entry)
    return yield* new Failed({
      stage: "configuration",
      path: "",
      cause: "No entries",
    });
  const conditions = options?.conditions ?? (yield* NodeConditions.current);
  const inputs =
    options?.inputs ?? (yield* CompilationInputs.make("Once", conditions));
  let externalPolicy = yield* RspackExternals.make({ inputs, conditions });
  for (const root of entries) yield* externalPolicy.check(root);
  const selected =
    options?.configuration ?? (yield* inputs.configuration(entry));
  for (const root of options?.configuration ? [] : entries) {
    const other = yield* inputs.configuration(root);
    if (other.configuration !== selected.configuration)
      return yield* new Failed({
        stage: "configuration",
        path: root,
        cause: "Entries require separate configuration contexts",
      });
  }
  yield* inputs.check;
  const directory = yield* fs.makeTempDirectoryScoped({
    directory: path.dirname(entry),
    prefix: ".confect-artifacts-",
  });
  const configurationDirectory = yield* fs.makeTempDirectoryScoped({
    prefix: ".confect-compiler-",
  });
  const configuration = path.join(configurationDirectory, "tsconfig.json");
  yield* fs.writeFileString(
    configuration,
    yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(
      selected.tsconfigRaw,
    ),
  );
  const recordingOptions = {
    hideArtifacts: true,
    visibleArtifacts: [configurationDirectory, configuration],
  };
  let recording = RspackInputs.make(recordingOptions);
  const inputFileSystem: NonNullable<Compiler["inputFileSystem"]> = {
    readFile: recording.fileSystem.readFile,
    stat: recording.fileSystem.stat,
    readlink: recording.fileSystem.readlink,
    readdir: recording.fileSystem.readdir,
  };
  for (const method of [
    "readFile",
    "stat",
    "lstat",
    "readlink",
    "realpath",
    "readdir",
  ] as const) {
    const original = recording.fileSystem[method];
    if (!original)
      return yield* new Failed({
        stage: "filesystem",
        path: method,
        cause: "Missing adapter method",
      });
    Object.defineProperty(inputFileSystem, method, {
      value: new Proxy(original, {
        apply(_target, receiver, args) {
          const current = recording.fileSystem[method];
          if (!current)
            throw new Failed({
              stage: "filesystem",
              path: method,
              cause: "Missing adapter method",
            });
          return Reflect.apply(current, receiver, args);
        },
      }),
    });
  }
  const components =
    options?.profile === "component-config"
      ? RspackComponents.make(path)
      : undefined;
  const ownership = RspackOwnership.make(
    path,
    options?.ownership ?? { ownedDirectories: [], authoredFiles: [] },
  );
  const owned = (file: string) =>
    ownership.owns(file) && !components?.isDefinition(file);
  const retained = (item: RspackInputs.Observation) =>
    item.path !== configuration &&
    item.path !== configurationDirectory &&
    (!owned(item.path) ||
      item.method === "realpath" ||
      item.method === "readlink");
  const loader = createRequire(import.meta.url).resolve("esbuild-loader");
  const create = Effect.try({
    try: () => {
      const value = rspack({
        mode: "development",
        context: path.dirname(entry),
        entry: Object.fromEntries(
          entries.map((root, index) => [String(index), root]),
        ),
        target: "node",
        devtool: false,
        cache: true,
        incremental: true,
        experiments: { useInputFileSystem: [/.*/] },
        externalsPresets: { node: false },
        externals: (data, callback) =>
          components &&
          data.request &&
          (components.isDefinition(data.request) ||
            components.isWrapper(data.request) ||
            components.isSource(data.request))
            ? callback()
            : externalPolicy.externals(data, callback),
        resolve: {
          tsConfig: { configFile: configuration },
          extensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
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
        module: {
          parser: {
            javascript: {
              exportsPresence: "error",
              requireResolve: false,
              requireAsExpression: false,
            },
          },
          rules: [
            ...ownership.rules,
            ...(components?.rules ?? []),
            {
              test: /\.([mc]?[tj]s|[tj]sx)$/,
              type: "javascript/auto",
              resolve: { fullySpecified: false },
              use: (info) => {
                if (!info.realResource)
                  throw new Failed({
                    stage: "loader",
                    path: info.resource ?? entry,
                    cause: "Missing physical resource identity",
                  });
                return [
                  {
                    loader,
                    options: {
                      target: "esnext",
                      implementation: { transform: esbuild.transform },
                      tsconfigRaw: selected.tsconfigRaw,
                      define: {
                        __filename: JSON.stringify(info.realResource),
                        __dirname: JSON.stringify(
                          path.dirname(info.realResource),
                        ),
                        "import.meta.url": JSON.stringify(
                          pathToFileURL(info.realResource).href,
                        ),
                      },
                    },
                  },
                ];
              },
            },
          ],
        },
        optimization: {
          minimize: false,
          nodeEnv: false,
          concatenateModules: false,
          ...(entries.length > 1
            ? {
                runtimeChunk: "single",
                splitChunks: { chunks: "all", minSize: 0, minChunks: 2 },
              }
            : {}),
        },
        plugins: [
          ownership.plugin,
          ...(components ? [components.plugin] : []),
          externalPolicy.plugin,
          (engine: Compiler) => {
            engine.hooks.normalModuleFactory.tap(
              "confect:attributes",
              (factory) => {
                factory.hooks.afterResolve.tap("confect:attributes", (data) => {
                  if (
                    /\.[cm]?[jt]sx?(?:[?#].*)?$/.test(
                      data.createData?.resource ?? "",
                    )
                  )
                    return;
                  if (
                    Object.entries(data.attributes ?? {}).some(
                      ([key, attribute]) =>
                        key !== "type" ||
                        !["json", "text", "bytes"].includes(attribute),
                    )
                  )
                    throw new UnsupportedAttributes({
                      path: data.request,
                      attributes: data.attributes ?? {},
                    });
                });
              },
            );
          },
        ],
        output: {
          path: directory,
          filename: "[name].mjs",
          chunkFilename: "chunk-[id].mjs",
          module: true,
          library: { type: "module" },
        },
      });
      value.inputFileSystem = inputFileSystem;
      return value;
    },
    catch: (cause) => new Failed({ stage: "create", path: entry, cause }),
  });
  let compiler: Compiler | undefined;
  const close = Effect.suspend(() => {
    const value = compiler;
    compiler = undefined;
    if (!value) return Effect.void;
    return Effect.callback<void, Failed>((resume) => {
      value.close((cause) =>
        resume(
          cause
            ? Effect.fail(new Failed({ stage: "close", path: entry, cause }))
            : Effect.void,
        ),
      );
    }).pipe(
      Effect.andThen(fs.readDirectory(directory)),
      Effect.flatMap((names) =>
        Effect.forEach(names, (name) =>
          fs.remove(path.join(directory, name), {
            recursive: true,
            force: true,
          }),
        ),
      ),
      Effect.asVoid,
      Effect.orDie,
    );
  });
  yield* Effect.addFinalizer(() => close);
  type Snapshot = {
    readonly graph: RspackGraph.Graph;
    readonly warnings: ReadonlyArray<esbuild.Message>;
    readonly assets: ReadonlyArray<{
      readonly name: string;
      readonly bytes: Uint8Array;
    }>;
    readonly observations: ReadonlyArray<RspackInputs.Observation>;
    readonly external: ReadonlyArray<RspackExternals.Observation>;
    readonly reusable: boolean;
    readonly fingerprints: Readonly<Record<string, string>>;
  };
  let previous: Snapshot | undefined;
  let builds = 0;
  let initialSize = 0;
  const capture = Effect.fn("RspackPrototype.capture")(function* () {
    yield* inputs.check;
    const changes = previous
      ? yield* recording.changes(previous.observations)
      : [];
    if (previous?.reusable && changes.length === 0) return previous;
    if (!previous?.reusable || builds >= 32) {
      previous = undefined;
      builds = 0;
      yield* close;
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      recording = RspackInputs.make(recordingOptions);
      externalPolicy = yield* RspackExternals.make({ inputs, conditions });
      for (const root of entries) yield* externalPolicy.check(root);
      if (!compiler) compiler = yield* create;
      const modifiedFiles = new Set(
        previous ? changes.map((change) => change.path) : [],
      );
      const removedFiles = new Set(
        previous
          ? (yield* Effect.forEach(changes, (change) =>
              Schema.decodeEffect(
                Schema.fromJsonString(
                  Schema.Struct({ error: Schema.optionalKey(Schema.String) }),
                ),
              )(change.actual).pipe(
                Effect.map((value) =>
                  value.error === "ENOENT" || value.error === "ENOTDIR"
                    ? [change.path]
                    : [],
                ),
              ),
            )).flat()
          : [],
      );
      const outcome = yield* run(compiler, entry, {
        modifiedFiles,
        removedFiles,
      }).pipe(
        Effect.flatMap((stats) =>
          Effect.try({
            try: () => ({
              graph: RspackGraph.capture(stats, entries),
              assets: stats.compilation.getAssets().map(({ name, source }) => {
                if (!source)
                  throw new Failed({
                    stage: "asset",
                    path: name,
                    cause: "Missing asset source",
                  });
                return { name, bytes: source.buffer() };
              }),
              warnings: (
                stats.toJson({ all: false, warnings: true }).warnings ?? []
              ).map((warning): esbuild.Message => ({
                id: "confect:rspack",
                pluginName: "rspack",
                text: warning.message,
                location: null,
                notes: [],
                detail: warning,
              })),
            }),
            catch: (cause) =>
              new Failed({ stage: "graph", path: entry, cause }),
          }),
        ),
        Effect.result,
      );
      const captured = yield* recording.capture;
      yield* inputs.check;
      if (outcome._tag === "Failure") {
        const warm = previous !== undefined;
        previous = undefined;
        builds = 0;
        yield* close;
        if (warm) continue;
        return yield* new Failed({
          stage: outcome.failure.stage,
          path: outcome.failure.path,
          cause: outcome.failure.cause,
          observations: captured.observations.filter(retained),
        });
      }
      const { graph, warnings, assets } = outcome.success;
      const external = yield* externalPolicy.capture;
      yield* captured.validate;
      const observations = [
        ...new Map(
          [...(previous?.observations ?? []), ...captured.observations].map(
            (item) => [JSON.stringify([item.method, item.path]), item],
          ),
        ).values(),
      ];
      const checked = yield* recording
        .validate(observations)
        .pipe(Effect.result);
      if (
        previous &&
        (checked._tag === "Failure" || observations.length > initialSize * 2)
      ) {
        previous = undefined;
        builds = 0;
        yield* close;
        if (
          checked._tag === "Failure" &&
          !Schema.is(RspackInputs.Changed)(checked.failure)
        )
          return yield* checked.failure;
        continue;
      }
      if (checked._tag === "Failure") return yield* checked.failure;
      yield* inputs.track(
        captured.observations
          .filter(
            (item) =>
              item.method === "readFile" &&
              path.basename(item.path) === "package.json",
          )
          .map((item) => item.path),
      );
      yield* inputs.check;
      yield* captured.validate;
      const fingerprints = yield* RspackGraph.fingerprints(
        graph,
        observations,
        external.observations,
        owned,
        components?.isWrapper,
      );
      previous = {
        graph,
        warnings,
        assets,
        observations,
        external: external.observations,
        reusable: external.reusable,
        fingerprints,
      };
      if (builds++ === 0) initialSize = observations.length;
      if (!previous.reusable) {
        const output = previous;
        previous = undefined;
        yield* close;
        return output;
      }
      return previous;
    }
    return yield* new Failed({
      stage: "capture",
      path: entry,
      cause: "Unproven warm provenance",
    });
  });
  const compile = Effect.fn("RspackPrototype.materialize")(function* () {
    const output = yield* capture().pipe(
      Effect.onError(() => {
        previous = undefined;
        builds = 0;
        return close;
      }),
    );
    const destination = yield* fs.makeTempDirectoryScoped({
      directory: path.dirname(entry),
      prefix: ".confect-artifacts-",
    });
    for (const asset of output.assets) {
      const file = path.resolve(destination, asset.name);
      if (
        path.relative(destination, file).startsWith("..") ||
        path.isAbsolute(path.relative(destination, file))
      )
        return yield* new Failed({
          stage: "asset",
          path: file,
          cause: "Asset escapes output directory",
        });
      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      yield* fs.writeFile(file, asset.bytes);
    }
    const observations = output.observations.filter(retained);
    const validate = inputs.check.pipe(
      Effect.andThen(recording.validate(observations)),
      Effect.andThen(inputs.check),
    );
    yield* validate;
    return {
      urls: Object.fromEntries(
        entries.map((root, index) => [
          root,
          pathToFileURL(path.join(destination, `${index}.mjs`)).href,
        ]),
      ),
      fingerprints: output.fingerprints,
      warnings: output.warnings,
      graph: output.graph,
      reusable: output.reusable,
      external: output.external,
      observations,
      validate,
    };
  }, Effect.provide(NodeCrypto.layer));
  return { compile };
}, Effect.provide(NodeCrypto.layer));

export const compileEntries = Effect.fn("RspackPrototype.compileEntries")(
  function* (
    entries: ReadonlyArray<string>,
    options?: Parameters<typeof make>[1] & {
      readonly compiler?: Effect.Success<ReturnType<typeof make>>;
    },
  ) {
    if (options?.compiler) return yield* options.compiler.compile();
    const owner = yield* Scope.Scope;
    const scope = yield* Scope.fork(owner, "sequential");
    const compiler = yield* make(entries, options).pipe(
      Effect.provideService(Scope.Scope, scope),
    );
    return yield* compiler
      .compile()
      .pipe(Effect.ensuring(Scope.close(scope, Exit.void)));
  },
);

export const compile = Effect.fn("RspackPrototype.compile")(function* (
  entry: string,
) {
  const prepared = yield* compileEntries([entry]);
  return { ...prepared, url: prepared.urls[entry] };
});
