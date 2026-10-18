import { createRequire, findPackageJSON, isBuiltin } from "node:module";
import { injectFileScopePlugin } from "bundle-require";
import { pathToFileURL } from "node:url";
import { resolveModulePath } from "exsolve";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Option from "effect/Option";
import * as Array from "effect/Array";
import * as Record from "effect/Record";
import * as HashMap from "effect/HashMap";
import * as Semaphore from "effect/Semaphore";
import type * as esbuild from "esbuild";
import * as CompilationInputs from "./CompilationInputs";
import { BundlerError } from "./BuildError";

export const namespace = "confect-generated";
export const nativeProbe = Symbol("confect-native-resolution");
export const componentPattern = /convex\.config/;

const resolveRequire = Option.liftThrowable(
  (specifier: string, importer: string) =>
    createRequire(importer).resolve(specifier),
);

const resolveImport = Option.liftThrowable(
  (specifier: string, importer: string, conditions: ReadonlyArray<string>) =>
    resolveModulePath(specifier, {
      from: importer,
      conditions: Array.prepend(conditions, "import"),
      cache: false,
    }),
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
  conditions: ReadonlyArray<string>,
  inputs: CompilationInputs.Inputs,
) {
  const imports = yield* Ref.make(
    HashMap.empty<
      string,
      ReadonlyArray<{
        readonly original: string;
        readonly path: string;
        readonly emitted: string;
      }>
    >(),
  );
  const resolutions = yield* Ref.make(
    HashMap.empty<
      string,
      {
        readonly required: Option.Option<string>;
        readonly imported: Option.Option<string>;
      }
    >(),
  );
  const resolveNative = (args: esbuild.OnResolveArgs) =>
    Ref.modify(resolutions, (current) => {
      const key = `${path.dirname(args.importer)}\0${args.path}`;
      const previous = HashMap.get(current, key);
      if (Option.isSome(previous)) return [previous.value, current];
      const resolved = {
        required: resolveRequire(args.path, args.importer),
        imported: resolveImport(args.path, args.importer, conditions),
      };
      return [resolved, HashMap.set(current, key, resolved)];
    });
  const discover = Effect.fn("CompilationPlugin.discover")(function* (
    importer: string,
    specifier: string,
    bare: boolean,
  ) {
    const candidates = bare
      ? Array.map(
          CompilationInputs.ancestors(path, path.dirname(importer)),
          (directory) =>
            path.join(directory, "node_modules", specifier, "package.json"),
        )
      : [];
    yield* inputs.track(candidates);
    yield* inputs.checkFiles(candidates);
    const manifest = Option.flatMap(
      packageManifest(specifier, importer),
      Option.fromNullishOr,
    );
    const known = yield* Option.match(manifest, {
      onNone: () => Effect.succeed([] as string[]),
      onSome: (file) =>
        fs.realPath(file).pipe(
          Effect.catch((cause) =>
            cause.reason._tag === "NotFound"
              ? Effect.succeed(file)
              : Effect.fail(new BundlerError({ cause })),
          ),
          Effect.map((real) => [file, real]),
        ),
    });
    const watchFiles = Array.dedupe([...candidates, ...known]);
    yield* inputs.track(watchFiles);
    yield* inputs.checkFiles(watchFiles);
    return {
      watchFiles,
      watchDirs: Array.dedupe(Array.map(watchFiles, path.dirname)),
    };
  });
  const discoveries = yield* Ref.make(
    HashMap.empty<string, { readonly run: ReturnType<typeof discover> }>(),
  );
  const discoveryLock = yield* Semaphore.make(1);
  const probes = yield* Ref.make(
    HashMap.empty<
      string,
      {
        readonly importer: string;
        readonly run: Effect.Effect<esbuild.ResolveResult>;
      }
    >(),
  );
  const probe = Effect.fn("CompilationPlugin.probe")(function* (
    build: esbuild.PluginBuild,
    args: esbuild.OnResolveArgs,
  ) {
    const resolve = Effect.promise(() =>
      build.resolve(args.path, {
        importer: args.importer,
        resolveDir: args.resolveDir,
        kind: args.kind,
        namespace: "file",
        pluginData: nativeProbe,
        with: args.with,
      }),
    );
    if (args.kind === "entry-point" || Record.size(args.with) > 0)
      return yield* resolve;
    const key = `${path.dirname(args.importer)}\0${args.path}\0${args.resolveDir}\0${args.kind}\0${args.namespace}`;
    const cached = yield* discoveryLock.withPermit(
      Effect.gen(function* () {
        const previous = HashMap.get(yield* Ref.get(probes), key);
        if (Option.isSome(previous)) return previous.value;
        const discovered = {
          importer: args.importer,
          run: yield* Effect.cached(resolve),
        };
        yield* Ref.update(probes, HashMap.set(key, discovered));
        return discovered;
      }),
    );
    const resolved = yield* cached.run;
    return cached.importer !== args.importer &&
      (resolved.errors.length > 0 || resolved.warnings.length > 0)
      ? yield* resolve
      : resolved;
  });
  const watches = Effect.fn("CompilationPlugin.watches")(function* (
    args: esbuild.OnResolveArgs,
  ) {
    yield* inputs.ensure;
    const bare =
      !args.path.startsWith(".") &&
      !args.path.startsWith("#") &&
      !path.isAbsolute(args.path);
    const specifier = bare
      ? args.path
          .split("/")
          .slice(0, args.path.startsWith("@") ? 2 : 1)
          .join("/")
      : args.path;
    const key = `${path.dirname(args.importer)}\0${specifier}`;
    const cached = yield* discoveryLock.withPermit(
      Effect.gen(function* () {
        const previous = HashMap.get(yield* Ref.get(discoveries), key);
        if (Option.isSome(previous)) return previous.value;
        const discovered = {
          run: yield* Effect.cached(discover(args.importer, specifier, bare)),
        };
        yield* Ref.update(discoveries, HashMap.set(key, discovered));
        return discovered;
      }),
    );
    return yield* cached.run;
  });
  const record = (
    args: esbuild.OnResolveArgs,
    resolved: string,
    emitted: string,
  ) =>
    Effect.runSyncWith(Context.empty())(
      Ref.update(imports, (current) =>
        HashMap.set(
          current,
          args.importer,
          Array.append(
            Option.getOrElse(HashMap.get(current, args.importer), () => []),
            {
              original: args.path,
              path: resolved,
              emitted,
            },
          ),
        ),
      ),
    );
  const plugin: esbuild.Plugin = {
    name: "confect:native-resolution",
    setup(build) {
      build.onStart(() =>
        Effect.runPromiseWith(Context.empty())(
          inputs.check.pipe(
            Effect.andThen(Ref.set(imports, HashMap.empty())),
            Effect.andThen(Ref.set(resolutions, HashMap.empty())),
            Effect.andThen(Ref.set(probes, HashMap.empty())),
            Effect.andThen(Ref.set(discoveries, HashMap.empty())),
            Effect.asVoid,
          ),
        ),
      );
      const injected = injectFileScopePlugin();
      void injected.setup({
        ...build,
        onLoad(options, callback) {
          build.onLoad(options, (args) =>
            Effect.runPromiseWith(Context.empty())(
              Effect.gen(function* () {
                yield* inputs.ensure;
                if (args.namespace === "file")
                  yield* inputs.trackSource(args.path);
                const loaded = yield* Effect.promise(() =>
                  Promise.resolve(callback(args)),
                );
                return args.namespace === namespace && loaded
                  ? { ...loaded, resolveDir: path.dirname(args.path) }
                  : loaded;
              }),
            ),
          );
        },
      });
      build.onResolve({ filter: /.*/ }, (args) =>
        Effect.runPromiseWith(Context.empty())(
          Effect.gen(function* () {
            yield* inputs.ensure;
            if (
              args.pluginData === nativeProbe ||
              (args.namespace !== "file" &&
                args.namespace !== "" &&
                args.namespace !== namespace)
            )
              return undefined;
            if (isBuiltin(args.path))
              return { path: args.path, external: true };
            const resolved = yield* probe(build, args);
            if (resolved.errors.length > 0) {
              if (!args.path.startsWith(".") && !path.isAbsolute(args.path)) {
                const watched = yield* watches(args);
                const { required } = yield* resolveNative(args);
                if (Option.isNone(required)) return undefined;
                yield* inputs.trackSource(required.value);
                yield* inputs.track([required.value]);
                const emitted =
                  args.kind === "require-call" ||
                  args.kind === "require-resolve"
                    ? required.value
                    : args.path;
                record(args, required.value, emitted);
                return {
                  path: emitted,
                  external: true,
                  ...watched,
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
                (args.path.startsWith(".") || path.isAbsolute(args.path)) &&
                !/[\\/]node_modules[\\/]/.test(args.path)
              )
                return undefined;
              yield* inputs.trackSource(resolved.path);
              const watched = yield* watches(args);
              const { required, imported } = yield* resolveNative(args);
              if (Option.isNone(required) && Option.isNone(imported))
                return undefined;
              const emitted =
                args.kind === "require-call" || args.kind === "require-resolve"
                  ? Option.getOrElse(required, () => resolved.path)
                  : Option.match(imported, {
                      onNone: () => args.path,
                      onSome: (file) => pathToFileURL(file).href,
                    });
              const physical =
                args.kind === "require-call" || args.kind === "require-resolve"
                  ? Option.getOrElse(required, () => resolved.path)
                  : Option.getOrElse(imported, () => resolved.path);
              yield* inputs.track([physical]);
              record(args, physical, emitted);
              return {
                path: emitted,
                external: true,
                ...watched,
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
          imports: Array.flatMap(metadata.imports, (imported) => {
            const matching = imported.external
              ? Array.filter(
                  Option.getOrElse(
                    HashMap.get(
                      captured,
                      path.resolve(cwd, physicalPath(file)),
                    ),
                    () => [],
                  ),
                  (item) => item.emitted === imported.path,
                )
              : [];
            return Array.isReadonlyArrayNonEmpty(matching)
              ? Array.map(matching, (match) => ({
                  ...imported,
                  path: match.path,
                  original: match.original,
                }))
              : [imported];
          }),
        })),
      };
    },
  };
});
