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

export const compile = Effect.fn("RspackPrototype.compile")(function* (
  entry: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const conditions = yield* NodeConditions.current;
  const inputs = yield* CompilationInputs.make("Once", conditions);
  const selected = yield* inputs.configuration(entry);
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
  yield* Effect.acquireUseRelease(
    Effect.try({
      try: () => {
        const value = rspack({
          mode: "development",
          context: path.dirname(entry),
          entry,
          target: "node",
          devtool: false,
          cache: false,
          incremental: false,
          experiments: { useInputFileSystem: [/.*/] },
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
            parser: { javascript: { exportsPresence: "error" } },
            rules: [
              {
                test: /\.[cm]?[jt]sx?$/,
                type: "javascript/auto",
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
          optimization: { minimize: false, nodeEnv: false },
          plugins: [
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
            filename: "entry.mjs",
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
    (value) => run(value, entry),
    (value) =>
      Effect.callback<void, Failed>((resume) => {
        value.close((cause) =>
          resume(
            cause
              ? Effect.fail(new Failed({ stage: "close", path: entry, cause }))
              : Effect.void,
          ),
        );
      }).pipe(Effect.orDie),
  );
  const captured = yield* recording.capture;
  yield* captured.validate;
  yield* inputs.check;
  return {
    url: pathToFileURL(path.join(directory, "entry.mjs")).href,
    observations: captured.observations,
    validate: inputs.check.pipe(
      Effect.andThen(captured.validate),
      Effect.andThen(inputs.check),
    ),
  };
});
