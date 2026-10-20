import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
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

const run = (compiler: Compiler, entry: string) =>
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
    });
  });

export const compileEntries = Effect.fn("RspackPrototype.compileEntries")(
  function* (
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
    const externalPolicy = yield* RspackExternals.make({ inputs, conditions });
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
    const recording = RspackInputs.make({
      hideArtifacts: true,
      visibleArtifacts: [configurationDirectory, configuration],
    });
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
    const outcome = yield* Effect.acquireUseRelease(
      Effect.try({
        try: () => {
          const value = rspack({
            mode: "development",
            context: path.dirname(entry),
            entry: Object.fromEntries(
              entries.map((root, index) => [String(index), root]),
            ),
            target: "node",
            devtool: false,
            cache: false,
            incremental: false,
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
                    factory.hooks.afterResolve.tap(
                      "confect:attributes",
                      (data) => {
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
                      },
                    );
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
          value.inputFileSystem = recording.fileSystem;
          return value;
        },
        catch: (cause) => new Failed({ stage: "create", path: entry, cause }),
      }),
      (value) =>
        run(value, entry).pipe(
          Effect.flatMap((stats) =>
            Effect.try({
              try: () => ({
                graph: RspackGraph.capture(stats, entries),
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
        ),
      (value) =>
        Effect.callback<void, Failed>((resume) => {
          value.close((cause) =>
            resume(
              cause
                ? Effect.fail(
                    new Failed({ stage: "close", path: entry, cause }),
                  )
                : Effect.void,
            ),
          );
        }).pipe(Effect.orDie),
    ).pipe(Effect.result);
    const captured = yield* recording.capture;
    yield* inputs.check;
    if (outcome._tag === "Failure")
      return yield* new Failed({
        stage: outcome.failure.stage,
        path: outcome.failure.path,
        cause: outcome.failure.cause,
        observations: captured.observations.filter(retained),
      });
    const { graph, warnings } = outcome.success;
    const external = yield* externalPolicy.capture;
    yield* captured.validate;
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
      captured.observations,
      external.observations,
      owned,
      components?.isWrapper,
    );
    return {
      urls: Object.fromEntries(
        entries.map((root, index) => [
          root,
          pathToFileURL(path.join(directory, `${index}.mjs`)).href,
        ]),
      ),
      fingerprints,
      warnings,
      graph,
      reusable: external.reusable,
      external: external.observations,
      observations: captured.observations.filter(retained),
      validate: inputs.check.pipe(
        Effect.andThen(
          recording.validate(captured.observations.filter(retained)),
        ),
        Effect.andThen(inputs.check),
      ),
    };
  },
  Effect.provide(NodeCrypto.layer),
);

export const compile = Effect.fn("RspackPrototype.compile")(function* (
  entry: string,
) {
  const prepared = yield* compileEntries([entry]);
  return { ...prepared, url: prepared.urls[entry] };
});
