import { createRequire, findPackageJSON, isBuiltin } from "node:module";
import { externalPlugin, injectFileScopePlugin } from "bundle-require";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Option from "effect/Option";
import * as Array from "effect/Array";
import * as Record from "effect/Record";
import type * as esbuild from "esbuild";

export const namespace = "confect-generated";
export const nativeProbe = Symbol("confect-native-resolution");
export const componentPattern = /convex\.config/;

const resolveRequire = Option.liftThrowable(
  (specifier: string, importer: string) =>
    createRequire(importer).resolve(specifier),
);

export const packageManifest = Option.liftThrowable(
  (specifier: string, importer: string) => findPackageJSON(specifier, importer),
);

export const physicalPath = (file: string): string =>
  file.startsWith(`${namespace}:`) ? file.slice(namespace.length + 1) : file;

export const make = Effect.fn("CompilationPlugin.make")(function* (
  path: Path.Path,
  fs: FileSystem.FileSystem,
  ownedDirectories: ReadonlyArray<string>,
  authoredFiles: ReadonlyArray<string>,
) {
  const imports = yield* Ref.make<
    Readonly<
      Record<
        string,
        ReadonlyArray<{ readonly original: string; readonly path: string }>
      >
    >
  >({});
  const watches = Effect.fn("CompilationPlugin.watches")(function* (
    args: esbuild.OnResolveArgs,
  ) {
    const manifest = Option.flatMap(
      packageManifest(args.path, args.importer),
      Option.fromNullishOr,
    );
    if (Option.isNone(manifest)) return { watchFiles: [], watchDirs: [] };
    const real = yield* fs
      .realPath(manifest.value)
      .pipe(Effect.orElseSucceed(() => manifest.value));
    return {
      watchFiles: Array.dedupe([manifest.value, real]),
      watchDirs: Array.dedupe([
        path.dirname(manifest.value),
        path.dirname(real),
      ]),
    };
  });
  const record = (args: esbuild.OnResolveArgs, resolved: string) =>
    Effect.runSyncWith(Context.empty())(
      Ref.update(imports, (current) => ({
        ...current,
        [args.importer]: Array.append(current[args.importer] ?? [], {
          original: args.path,
          path: resolved,
        }),
      })),
    );
  const plugin: esbuild.Plugin = {
    name: "confect:native-resolution",
    setup(build) {
      return Effect.runPromiseWith(Context.empty())(
        Effect.gen(function* () {
          build.onStart(() => {
            Effect.runSyncWith(Context.empty())(Ref.set(imports, {}));
          });
          let externalize: Parameters<
            esbuild.PluginBuild["onResolve"]
          >[1] = () => undefined;
          yield* Effect.promise(() =>
            Promise.resolve(
              externalPlugin().setup({
                ...build,
                onResolve(_options, callback) {
                  externalize = callback;
                },
              }),
            ),
          );
          const injected = injectFileScopePlugin();
          void injected.setup({
            ...build,
            onLoad(options, callback) {
              build.onLoad(options, (args) =>
                Promise.resolve(callback(args)).then((loaded) =>
                  args.namespace === namespace && loaded
                    ? { ...loaded, resolveDir: path.dirname(args.path) }
                    : loaded,
                ),
              );
            },
          });
          build.onResolve({ filter: /.*/ }, (args) =>
            Effect.runPromiseWith(Context.empty())(
              Effect.gen(function* () {
                if (
                  args.pluginData === nativeProbe ||
                  (args.namespace !== "file" &&
                    args.namespace !== "" &&
                    args.namespace !== namespace)
                )
                  return undefined;
                if (isBuiltin(args.path))
                  return { path: args.path, external: true };
                const resolved = yield* Effect.promise(() =>
                  build.resolve(args.path, {
                    importer: args.importer,
                    resolveDir: args.resolveDir,
                    kind: args.kind,
                    namespace: "file",
                    pluginData: nativeProbe,
                  }),
                );
                if (resolved.errors.length > 0) {
                  if (
                    !args.path.startsWith(".") &&
                    !path.isAbsolute(args.path)
                  ) {
                    const required = resolveRequire(args.path, args.importer);
                    const origin =
                      build.initialOptions.absWorkingDir ?? args.resolveDir;
                    const fromOutput = resolveRequire(
                      args.path,
                      path.join(origin, "_"),
                    );
                    if (Option.isNone(required) || Option.isNone(fromOutput))
                      return undefined;
                    if (fromOutput.value !== required.value)
                      return {
                        errors: [
                          {
                            text: `Persistent compilation cannot externalize "${args.path}" across package scopes.`,
                          },
                        ],
                      };
                    record(args, required.value);
                    return {
                      path: args.path,
                      external: true,
                      ...(yield* watches(args)),
                    };
                  }
                  return undefined;
                }
                if (resolved.external) return resolved;
                if (
                  !Array.contains(authoredFiles, resolved.path) &&
                  Array.some(ownedDirectories, (directory) => {
                    const relative = path.relative(directory, resolved.path);
                    return (
                      relative !== ".." &&
                      !relative.startsWith(`..${path.sep}`) &&
                      !path.isAbsolute(relative)
                    );
                  })
                )
                  return { ...resolved, namespace };
                if (
                  args.kind !== "entry-point" &&
                  /[\\/]node_modules[\\/]/.test(resolved.path)
                ) {
                  if (
                    !args.path.startsWith(".") &&
                    !path.isAbsolute(args.path)
                  ) {
                    const origin =
                      build.initialOptions.absWorkingDir ?? args.resolveDir;
                    const fromOutput = yield* Effect.promise(() =>
                      build.resolve(args.path, {
                        importer: path.join(origin, "_"),
                        resolveDir: origin,
                        kind: args.kind,
                        namespace: "file",
                        pluginData: nativeProbe,
                      }),
                    );
                    if (
                      fromOutput.path !== resolved.path ||
                      fromOutput.errors.length > 0
                    )
                      return {
                        errors: [
                          {
                            text: `Persistent compilation cannot externalize "${args.path}" from ${args.importer}: the artifact directory has a different package scope.`,
                          },
                        ],
                      };
                  }
                  record(args, resolved.path);
                  return {
                    ...(yield* Effect.promise(() =>
                      Promise.resolve(externalize(args)),
                    )),
                    ...(yield* watches(args)),
                  };
                }
                return undefined;
              }),
            ),
          );
          build.onLoad({ filter: /.*/, namespace }, (args) =>
            Effect.runPromiseWith(Context.empty())(
              fs.readFile(args.path).pipe(
                Effect.map((contents) => ({
                  contents,
                  loader: path.extname(args.path) === ".json" ? "json" : "text",
                  resolveDir: path.dirname(args.path),
                })),
              ),
            ),
          );
        }),
      );
    },
  };
  return {
    plugin,
    normalize: (metafile: esbuild.Metafile, cwd: string): esbuild.Metafile => {
      const captured = Effect.runSyncWith(Context.empty())(Ref.get(imports));
      return {
        ...metafile,
        inputs: Record.map(metafile.inputs, (metadata, file) => ({
          ...metadata,
          imports: Array.map(metadata.imports, (imported) => {
            const match = imported.external
              ? Array.findFirst(
                  captured[path.resolve(cwd, physicalPath(file))] ?? [],
                  (item) => item.original === imported.path,
                )
              : Option.none();
            return Option.isSome(match)
              ? {
                  ...imported,
                  path: match.value.path,
                  original: match.value.original,
                }
              : imported;
          }),
        })),
      };
    },
  };
});
