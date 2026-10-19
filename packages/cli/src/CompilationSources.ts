import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Hex from "effect/encoding/Hex";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as esbuild from "esbuild";
import * as CompilationPlugin from "./CompilationPlugin";
import type * as CompilationInputs from "./CompilationInputs";

export class Rejected extends Schema.TaggedError<Rejected>()(
  "CompilationSourceRejected",
  { path: Schema.String, resolvedPath: Schema.String },
) {
  override get message() {
    return `Compilation cannot read protected input ${this.path}`;
  }
}

export class Unobserved extends Schema.TaggedError<Unobserved>()(
  "CompilationSourceUnobserved",
  { paths: Schema.Array(Schema.String) },
) {
  override get message() {
    return `Compilation did not observe loaded inputs: ${this.paths.join(", ")}`;
  }
}

class TransformFailed extends Schema.TaggedError<TransformFailed>()(
  "CompilationSourceTransformFailed",
  { path: Schema.String, cause: Schema.Unknown },
) {}

const serializeIdentity = (parts: ReadonlyArray<string | undefined>): string =>
  JSON.stringify(parts);

export const make = Effect.fn("CompilationSources.make")(function* (
  options: esbuild.BuildOptions,
  trackSource?: CompilationInputs.Inputs["trackSource"],
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;
  let contents = new Map<string, string>();
  const rejected = yield* Ref.make(Option.none<Rejected>());
  const ensure = Effect.gen(function* () {
    const failure = yield* Ref.get(rejected);
    if (Option.isSome(failure)) return yield* failure.value;
  });
  const cwd = options.absWorkingDir ?? path.resolve(".");
  const attributes = (value: Record<string, string>) =>
    JSON.stringify(
      Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
    );
  const key = (file: string, namespace: string, suffix = "") =>
    namespace === "file" || namespace === ""
      ? `${path.resolve(cwd, file)}${suffix}`
      : `${namespace}:${file}${suffix}`;
  const readable = Effect.fn("CompilationSources.readable")(
    function* (file: string) {
      if (path.basename(file) === ".env.local")
        return yield* new Rejected({ path: file, resolvedPath: file });
      const real = yield* fs.realPath(file);
      if (path.basename(real) === ".env.local")
        return yield* new Rejected({ path: file, resolvedPath: real });
      return real;
    },
    Effect.tapError((error) =>
      error._tag === "CompilationSourceRejected"
        ? Ref.set(rejected, Option.some(error)).pipe(Effect.asVoid)
        : Effect.void,
    ),
  );
  const observe = Effect.fn("CompilationSources.observe")(function* (
    observed: Map<string, string>,
    args: esbuild.OnLoadArgs,
    loaded: esbuild.OnLoadResult | null | undefined,
    original?: Uint8Array,
  ) {
    if (loaded?.contents === undefined) return loaded;
    const bytes =
      typeof loaded.contents === "string"
        ? new TextEncoder().encode(loaded.contents)
        : loaded.contents;
    const digest = Hex.encode(yield* crypto.digest("SHA-256", bytes));
    const originalDigest = original
      ? Hex.encode(yield* crypto.digest("SHA-256", original))
      : undefined;
    observed.set(
      `${key(args.path, args.namespace, args.suffix)}\0${attributes(args.with)}`,
      serializeIdentity([
        digest,
        originalDigest,
        loaded.loader ?? "js",
        loaded.resolveDir ?? "",
        attributes(args.with),
      ]),
    );
    return loaded;
  });
  const wrap = (plugin: esbuild.Plugin): esbuild.Plugin => ({
    name: plugin.name,
    setup(build) {
      return plugin.setup({
        ...build,
        onLoad(filter, callback) {
          build.onLoad(filter, (args) => {
            const observed = contents;
            return Effect.runPromiseWith(Context.empty())(
              Effect.gen(function* () {
                if (
                  args.namespace === "file" ||
                  args.namespace === CompilationPlugin.namespace ||
                  path.basename(args.path) === ".env.local" ||
                  (path.isAbsolute(args.path) && (yield* fs.exists(args.path)))
                )
                  yield* readable(args.path);
                if (
                  (args.namespace === "file" ||
                    args.namespace === CompilationPlugin.namespace) &&
                  trackSource
                )
                  yield* trackSource(args.path);
                const loaded = yield* Effect.promise(() =>
                  Promise.resolve(callback(args)),
                );
                return yield* observe(observed, args, loaded);
              }),
            );
          });
        },
      });
    },
  });
  const native: esbuild.Plugin = {
    name: "confect:source-files",
    setup(build) {
      build.onLoad({ filter: /.*/, namespace: "dataurl" }, (args) => {
        contents.set(
          `${key(args.path, args.namespace, args.suffix)}\0${attributes(args.with)}`,
          serializeIdentity([
            "native-data-url",
            args.path,
            attributes(args.with),
          ]),
        );
        return undefined;
      });
      build.onLoad({ filter: /.*/, namespace: "file" }, (args) => {
        const observed = contents;
        return Effect.runPromiseWith(Context.empty())(
          Effect.gen(function* () {
            const file = yield* readable(args.path);
            if (trackSource) yield* trackSource(args.path);
            const bytes = yield* fs.readFile(file);
            const loaders: Readonly<Record<string, esbuild.Loader>> = {
              text: "text",
              bytes: "binary",
              json: "json",
            };
            if (
              Object.entries(args.with).some(
                ([name, value]) => name !== "type" || !loaders[value],
              )
            )
              return {
                errors: [
                  {
                    text: `Unsupported import attributes for ${args.path}: ${attributes(args.with)}`,
                  },
                ],
              };
            if (args.with.type === "json") {
              yield* observe(observed, args, {
                contents: bytes,
                loader: "json",
              });
              const transformed = yield* Effect.tryPromise({
                try: () =>
                  esbuild.transform(bytes, {
                    loader: "json",
                    format: "cjs",
                    sourcefile: args.path,
                    sourcemap: "inline",
                    banner: "const module = { exports: undefined };",
                    footer: "export default module.exports;",
                  }),
                catch: (cause) =>
                  new TransformFailed({ path: args.path, cause }),
              }).pipe(
                Effect.map((result) => ({
                  contents: result.code,
                  loader: "js" as const,
                  resolveDir: path.dirname(args.path),
                  warnings: result.warnings,
                })),
                Effect.catch((error) =>
                  Effect.succeed({ errors: [{ text: String(error.cause) }] }),
                ),
              );
              return yield* observe(observed, args, transformed, bytes);
            }
            return yield* observe(observed, args, {
              contents: bytes,
              loader: args.with.type ? loaders[args.with.type] : "default",
              resolveDir: path.dirname(args.path),
            });
          }),
        );
      });
    },
  };
  return {
    ensure,
    plugins: [
      {
        name: "confect:source-observation",
        setup(build) {
          build.onStart(() => {
            contents = new Map();
          });
        },
      } satisfies esbuild.Plugin,
      ...(options.plugins ?? []).map(wrap),
      native,
    ],
    captured: Effect.sync(() =>
      Object.fromEntries(
        Array.from(contents).filter(
          ([file]) =>
            !file.startsWith(`${CompilationPlugin.namespace}:`) &&
            !file.startsWith("dataurl:"),
        ),
      ),
    ),
    inputs: Effect.fn("CompilationSources.inputs")(function* (
      metafile: esbuild.Metafile,
    ) {
      const observed = contents;
      const immutable = Object.fromEntries(
        Object.values(metafile.inputs).flatMap((metadata) =>
          metadata.imports.flatMap((imported) =>
            imported.original?.startsWith("data:") && !imported.external
              ? [
                  [
                    imported.path,
                    observed.get(
                      `${key(imported.original, "dataurl")}\0${attributes(imported.with ?? {})}`,
                    ),
                  ],
                ]
              : [],
          ),
        ),
      );
      const lookup = (
        file: string,
        metadata: esbuild.Metafile["inputs"][string],
      ) => {
        const suffix = attributes(metadata.with ?? {});
        const base = metadata.with ? file.replace(/ with \{.*\}$/, "") : file;
        return (
          observed.get(`${file}\0${suffix}`) ??
          observed.get(`${path.resolve(cwd, file)}\0${suffix}`) ??
          observed.get(`${base}\0${suffix}`) ??
          observed.get(`${path.resolve(cwd, base)}\0${suffix}`) ??
          immutable[file]
        );
      };
      const missing = Object.keys(metafile.inputs).filter(
        (file) =>
          lookup(file, metafile.inputs[file] ?? { bytes: 0, imports: [] }) ===
          undefined,
      );
      if (missing.length > 0) return yield* new Unobserved({ paths: missing });
      return Object.fromEntries(
        Object.keys(metafile.inputs).map((file) => [
          file,
          lookup(file, metafile.inputs[file] ?? { bytes: 0, imports: [] }) ??
            "",
        ]),
      );
    }),
  };
});
