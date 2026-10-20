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

export class Failed extends Schema.TaggedError<Failed>()(
  "RspackPrototypeCompilationFailed",
  { stage: Schema.String, path: Schema.String, cause: Schema.Unknown },
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
    const selected = yield* inputs.configuration(entry);
    for (const root of entries) {
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
      prefix: ".rspack-prototype-",
    });
    const configuration = path.join(
      yield* fs.makeTempDirectoryScoped(),
      "tsconfig.json",
    );
    yield* fs.writeFileString(
      configuration,
      yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(
        selected.tsconfigRaw,
      ),
    );
    const recording = RspackInputs.make();
    const loader = createRequire(import.meta.url).resolve("esbuild-loader");
    const graph = yield* Effect.acquireUseRelease(
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
            externals: externalPolicy.externals,
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
                {
                  test: /\.[cm]?[jt]sx?$/,
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
              try: () => RspackGraph.capture(stats, entries),
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
    );
    const captured = yield* recording.capture;
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
    );
    return {
      urls: Object.fromEntries(
        entries.map((root, index) => [
          root,
          pathToFileURL(path.join(directory, `${index}.mjs`)).href,
        ]),
      ),
      fingerprints,
      graph,
      reusable: external.reusable,
      external: external.observations,
      observations: captured.observations,
      validate: inputs.check.pipe(
        Effect.andThen(captured.validate),
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
