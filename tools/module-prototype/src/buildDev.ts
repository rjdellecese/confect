import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as esbuild from "esbuild";

class Failed extends Schema.TaggedError<Failed>()("RspackLauncherBuildFailed", {
  cause: Schema.Unknown,
}) {}

Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const output = path.resolve(import.meta.dirname, "../dist");
  const resolving = Symbol("resolve-launcher-dependency");
  yield* Effect.tryPromise({
    try: () =>
      esbuild.build({
        entryPoints: [path.join(import.meta.dirname, "rspackDev.ts")],
        outfile: path.join(output, "rspackDev.mjs"),
        bundle: true,
        platform: "node",
        format: "esm",
        target: "node24",
        sourcemap: true,
        plugins: [
          {
            name: "resolve-private-launcher-dependencies",
            setup(build) {
              build.onResolve({ filter: /^[^./]/ }, (args) => {
                if (args.pluginData === resolving || path.isAbsolute(args.path))
                  return;
                return build
                  .resolve(args.path, {
                    kind: args.kind,
                    resolveDir: args.resolveDir,
                    pluginData: resolving,
                  })
                  .then((resolved) => ({
                    path: resolved.path,
                    external: true,
                    errors: resolved.errors,
                    warnings: resolved.warnings,
                  }));
              });
            },
          },
        ],
      }),
    catch: (cause) => new Failed({ cause }),
  });
  const worker = new URL(
    "../../../packages/cli/dist/EvaluationWorker.mjs",
    import.meta.url,
  ).href;
  const literal = yield* Schema.encodeEffect(
    Schema.fromJsonString(Schema.String),
  )(worker);
  yield* fs.writeFileString(
    path.join(output, "EvaluationWorker.mjs"),
    `import ${literal};\n`,
  );
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
