import { createRequire, isBuiltin } from "node:module";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  bundleRequire,
  dynamicImport,
  injectFileScopePlugin,
  JS_EXT_RE,
  loadTsConfig,
  tsconfigPathsToRegExp,
} from "bundle-require";
import { resolveModulePath } from "exsolve";
import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Scope from "effect/Scope";
import * as String from "effect/String";
import * as esbuild from "esbuild";
import { BundlerError } from "./BuildError";
import { logCoalescedBuildWarnings } from "./log";

export interface Bundled {
  readonly module: any;
  readonly metafile: esbuild.Metafile;
}

/**
 * `bundle-require` sets `absWorkingDir: cwd` on the underlying esbuild build,
 * so the metafile's input keys (and each input's `imports[].path`) are stored
 * relative to that cwd. Callers reach for the metafile with absolute paths
 * (e.g. {@link directlyImports}), so we normalize every key/import path to
 * absolute up front. That way the lookup logic stays oblivious to whatever cwd
 * was used during bundling.
 *
 * `original` (the specifier as written, before resolution) is filled in from
 * `path` when esbuild omits it—esbuild only sets it when it differs from the
 * resolved path, which is exactly the externalized-bare-specifier case that
 * absolutizing `path` would otherwise mangle into `<cwd>/@confect/server`.
 * {@link importersOfPackage} relies on `original` always being the raw
 * specifier.
 */
const absolutizeMetafile = (
  path: Path.Path,
  metafile: esbuild.Metafile,
  cwd: string,
): esbuild.Metafile => {
  const absolutize = (p: string) => path.resolve(cwd, p);
  const inputs: esbuild.Metafile["inputs"] = {};
  for (const [key, value] of Object.entries(metafile.inputs)) {
    inputs[absolutize(key)] = {
      ...value,
      imports: value.imports.map((i) =>
        Object.assign({}, i, {
          path: absolutize(i.path),
          original: i.original ?? i.path,
        }),
      ),
    };
  }
  const outputs: esbuild.Metafile["outputs"] = {};
  for (const [key, value] of Object.entries(metafile.outputs)) {
    outputs[absolutize(key)] = value;
  }
  return { inputs, outputs };
};

const resolveEsm = Option.liftThrowable((specifier: string, importer: string) =>
  resolveModulePath(specifier, {
    from: importer,
    conditions: ["node", "import"],
  }),
);

const resolveCjs = Option.liftThrowable((specifier: string, importer: string) =>
  createRequire(importer).resolve(specifier),
);

export const resolveModule = (
  specifier: string,
  importer: string,
): Option.Option<string> =>
  Option.orElse(resolveEsm(specifier, importer), () =>
    resolveCjs(specifier, importer),
  );

/**
 * Bundles first-party workspace dependencies that `bundle-require` would
 * otherwise externalize and hand to Node's native ESM resolver. Resolves each
 * bare specifier and, following symlinks, bundles it when its real path lives
 * outside `node_modules`—mirroring Vite's "linked dependencies are not
 * externalized" heuristic. Registered ahead of `externalPlugin`, so deferring
 * (returning `undefined`) leaves third-party externalization untouched.
 * `skipPatterns` are the tsconfig `paths` regexes, which keep deferring to
 * esbuild's own `paths` resolution.
 */
export const bundleWorkspacePlugin = (
  path: Path.Path,
  fs: FileSystem.FileSystem,
  skipPatterns: ReadonlyArray<RegExp>,
): esbuild.Plugin => ({
  name: "confect:bundle-workspace",
  setup(build) {
    build.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.namespace !== "file" && args.namespace !== "") return undefined;
      if (isBuiltin(args.path) || path.isAbsolute(args.path)) return undefined;
      if (Array.some(skipPatterns, (pattern) => pattern.test(args.path))) {
        return undefined;
      }

      const importer =
        args.importer !== "" ? args.importer : path.join(args.resolveDir, "_");

      return Option.match(resolveModule(args.path, importer), {
        onNone: () => ({
          path: args.path,
          external: true,
          warnings: [
            {
              text: `Confect could not resolve workspace dependency "${args.path}" (imported from ${importer}) to bundle it; leaving it external.`,
            },
          ],
        }),
        onSome: (resolved) =>
          Effect.runPromise(
            fs.realPath(resolved).pipe(Effect.orElseSucceed(() => resolved)),
          ).then((real) =>
            pipe(real, String.split(path.sep), Array.contains("node_modules"))
              ? undefined
              : { path: real },
          ),
      });
    });
  },
});

interface CapturedBuildResult {
  readonly metafile: esbuild.Metafile | undefined;
  readonly warnings: ReadonlyArray<esbuild.Message>;
}

const captureBuildResultPlugin = (
  ref: Ref.Ref<CapturedBuildResult>,
): esbuild.Plugin => ({
  name: "confect:capture-build-result",
  setup(build) {
    build.onEnd((result) => {
      Effect.runSync(
        Ref.set(ref, {
          metafile: result.metafile,
          warnings: result.warnings,
        }),
      );
    });
  },
});

interface BatchCompilation {
  readonly entries: HashMap.HashMap<
    string,
    { readonly source: string; readonly output: string }
  >;
  readonly metafile: esbuild.Metafile;
  readonly warnings: ReadonlyArray<esbuild.Message>;
  readonly cwd: string;
}

class Batch extends Context.Service<
  Batch,
  {
    readonly entryPoints: ReadonlyArray<string>;
    readonly compilation: Effect.Effect<
      Option.Option<BatchCompilation>,
      never,
      Path.Path | FileSystem.FileSystem
    >;
  }
>()("@confect/cli/Bundler/Batch") {}

interface ExternalImport {
  readonly path: string;
  readonly original: string;
}

const batchResolutionPlugin = (
  path: Path.Path,
  fs: FileSystem.FileSystem,
  skipPatterns: ReadonlyArray<RegExp>,
  conditions: string[],
  externalImports: Ref.Ref<
    HashMap.HashMap<string, ReadonlyArray<ExternalImport>>
  >,
): esbuild.Plugin => ({
  name: "confect:batch-resolution",
  setup(build) {
    const external = (args: esbuild.OnResolveArgs, resolved: string) => {
      const importer = path.resolve(args.importer);
      Effect.runSync(
        Ref.update(
          externalImports,
          HashMap.modifyAt(importer, (imports) =>
            Option.some(
              Array.append(
                Option.getOrElse(imports, () => []),
                { path: resolved, original: args.path },
              ),
            ),
          ),
        ),
      );
      return { path: resolved, external: true };
    };
    build.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === "entry-point") return undefined;
      if (isBuiltin(args.path)) return { path: args.path, external: true };
      if (Array.some(skipPatterns, (pattern) => pattern.test(args.path)))
        return undefined;
      if (/[\\/]node_modules[\\/]/.test(args.path)) {
        return external(
          args,
          pathToFileURL(path.resolve(args.resolveDir, args.path)).href,
        );
      }
      if (args.path.startsWith(".") || path.isAbsolute(args.path))
        return undefined;

      const resolved = resolveModule(args.path, args.importer);
      if (Option.isNone(resolved)) {
        return {
          errors: [
            { text: `Could not resolve "${args.path}" from ${args.importer}` },
          ],
        };
      }
      return Effect.runPromise(
        fs
          .realPath(resolved.value)
          .pipe(Effect.orElseSucceed(() => resolved.value)),
      ).then((real) => {
        if (!/[\\/]node_modules[\\/]/.test(real)) return { path: real };
        if (args.kind === "require-call" || args.kind === "require-resolve") {
          return external(
            args,
            createRequire(args.importer).resolve(args.path),
          );
        }
        return external(
          args,
          pathToFileURL(
            resolveModulePath(args.path, {
              from: args.importer,
              conditions,
            }),
          ).href,
        );
      });
    });
  },
});

const compileBatch = Effect.fn("Bundler.compileBatch")(function* (
  entryPoints: ReadonlyArray<string>,
) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const nodeOptions = yield* Config.String("NODE_OPTIONS").pipe(
    Config.withDefault(""),
  );
  if (/--conditions|-C|--(?:no-)?addons/.test(nodeOptions))
    return Option.none<BatchCompilation>();
  const runtimeOptions = yield* Effect.try({
    try: () =>
      parseArgs({
        args: process.execArgv,
        options: {
          conditions: { type: "string", short: "C", multiple: true },
          "no-addons": { type: "boolean" },
        },
        strict: false,
        allowPositionals: true,
      }).values,
    catch: (cause) => new BundlerError({ cause }),
  });
  const conditions = [
    "node",
    "import",
    ...(process.features.require_module ? ["module-sync"] : []),
    ...(runtimeOptions["no-addons"] ? [] : ["node-addons"]),
    ...(runtimeOptions.conditions ?? []).filter(
      (condition) => typeof condition === "string",
    ),
  ];
  const entries = Array.dedupe(entryPoints.map((entry) => path.resolve(entry)));
  const first = entries[0];
  if (
    first === undefined ||
    entries.some(
      (entry) => !JS_EXT_RE.test(entry) || /[\\/]node_modules[\\/]/.test(entry),
    )
  ) {
    return Option.none<BatchCompilation>();
  }
  const configs = yield* Effect.try({
    try: () => entries.map((entry) => loadTsConfig(path.dirname(entry))),
    catch: (cause) => new BundlerError({ cause }),
  });
  const config = configs[0];
  if (configs.some((other) => other?.path !== config?.path))
    return Option.none<BatchCompilation>();

  const cwd = path.dirname(first);
  const directory = yield* fs.makeTempDirectoryScoped({
    prefix: "confect-batch-",
  });
  const artifacts = yield* Effect.forEach(entries, (entry, index) =>
    Effect.map(
      fs.realPath(entry),
      (source) =>
        [
          entry,
          { source, output: path.join(directory, `${index}.mjs`) },
        ] as const,
    ),
  );
  const externalImports = yield* Ref.make(
    HashMap.empty<string, ReadonlyArray<ExternalImport>>(),
  );
  const result = yield* Effect.tryPromise({
    try: () =>
      esbuild.build({
        entryPoints: entries.map((entry, index) => ({
          in: entry,
          out: `${index}`,
        })),
        absWorkingDir: cwd,
        outdir: directory,
        outExtension: { ".js": ".mjs" },
        chunkNames: "chunk-[hash]",
        format: "esm",
        platform: "node",
        sourcemap: "inline",
        bundle: true,
        splitting: true,
        metafile: true,
        write: false,
        logLevel: "silent",
        ...(config?.path
          ? { tsconfig: config.path }
          : { tsconfigRaw: config?.data ?? {} }),
        plugins: [
          batchResolutionPlugin(
            path,
            fs,
            tsconfigPathsToRegExp(config?.data.compilerOptions?.paths ?? {}),
            conditions,
            externalImports,
          ),
          injectFileScopePlugin(),
        ],
      }),
    catch: (cause) => new BundlerError({ cause }),
  });
  const inputPaths = HashSet.fromIterable(
    Object.keys(result.metafile.inputs).map((input) =>
      path.resolve(cwd, input),
    ),
  );
  if (
    result.warnings.some(
      (warning) =>
        !warning.location ||
        !HashSet.has(inputPaths, path.resolve(cwd, warning.location.file)),
    )
  )
    return Option.none<BatchCompilation>();
  yield* Effect.forEach(result.outputFiles, (output) =>
    fs.writeFile(output.path, output.contents),
  );
  const capturedExternalImports = yield* Ref.get(externalImports);
  const inputs = Object.fromEntries(
    Object.entries(result.metafile.inputs).map(([input, metadata]) => {
      const originals = Option.getOrElse(
        HashMap.get(capturedExternalImports, path.resolve(cwd, input)),
        () => [],
      );
      return [
        input,
        {
          ...metadata,
          imports: metadata.imports.flatMap((imported) => {
            const matching = imported.external
              ? originals.filter((original) => original.path === imported.path)
              : [];
            return matching.length === 0
              ? [imported]
              : matching.map((original) =>
                  Object.assign({}, imported, {
                    original: original.original,
                  }),
                );
          }),
        },
      ];
    }),
  );
  return Option.some<BatchCompilation>({
    entries: HashMap.fromIterable(artifacts),
    metafile: absolutizeMetafile(path, { ...result.metafile, inputs }, cwd),
    warnings: result.warnings,
    cwd,
  });
});

/**
 * Lazily shares one compilation across ordinary bundle calls in this effect.
 * Different tsconfigs and failed compilations fall back to individual builds.
 * Runtime conditions supplied through NODE_OPTIONS also use individual builds.
 * Imports still run at each caller, and temporary chunks live until the effect
 * finishes. The disposable evaluator, not this scope, owns Node's import
 * cache.
 */
export const withBatch = <A, E, R>(
  entryPoints: ReadonlyArray<string>,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.scopedWith((scope) =>
    Effect.gen(function* () {
      const compilation = yield* Effect.cached(
        compileBatch(entryPoints).pipe(
          Effect.provideService(Scope.Scope, scope),
          Effect.orElseSucceed(() => Option.none<BatchCompilation>()),
        ),
      );
      return yield* Effect.provideService(effect, Batch, {
        entryPoints,
        compilation,
      });
    }),
  );

const entryMetafile = (
  path: Path.Path,
  compilation: BatchCompilation,
  source: string,
  output: string,
): esbuild.Metafile => {
  const inputs: esbuild.Metafile["inputs"] = {};
  const pendingInputs = [source];
  for (const key of pendingInputs) {
    if (inputs[key]) continue;
    const input = compilation.metafile.inputs[key];
    if (!input) continue;
    inputs[key] = input;
    for (const imported of input.imports) {
      if (!imported.external) pendingInputs.push(imported.path);
    }
  }
  const outputs: esbuild.Metafile["outputs"] = {};
  const pendingOutputs = [output];
  for (const key of pendingOutputs) {
    if (outputs[key]) continue;
    const artifact = compilation.metafile.outputs[key];
    if (!artifact) continue;
    outputs[key] = artifact;
    for (const imported of artifact.imports) {
      if (!imported.external)
        pendingOutputs.push(path.resolve(compilation.cwd, imported.path));
    }
  }
  return { inputs, outputs };
};

/**
 * Bundle a TypeScript entry point with esbuild via {@link bundleRequire} and
 * import the result. `bundle-require` writes a temp `.mjs` next to the source,
 * `import()`s it, and deletes it—so third-party `node_modules` externals
 * resolve through the user's normal `node_modules` walk, while first-party
 * workspace deps are bundled by {@link bundleWorkspacePlugin} and tsconfig
 * `paths` aliases stay inside the bundle.
 *
 * `cwd` is set to the entry's directory so `bundle-require`'s `tsconfig.json`
 * discovery (which walks upward from `cwd`) lands on the project's tsconfig
 * regardless of where `confect codegen` was invoked from, and so esbuild
 * resolves relative imports against the entry's location.
 *
 * The returned pair carries both the imported module and the esbuild metafile
 * so callers can inspect the import graph (see {@link directlyImports}); the
 * metafile is captured via a small `onEnd` plugin because `bundle-require`
 * itself only exposes a flat `dependencies: string[]`.
 *
 * `options.plugins` are registered ahead of every other plugin—including
 * `bundle-require`'s own `externalPlugin`—so a caller-supplied plugin can claim
 * resolutions (e.g. `convex.config` imports) before the workspace and
 * externalization heuristics see them.
 */
export const bundle = Effect.fn("Bundler.bundle")(function* (
  entryPoint: string,
  options?: { readonly plugins?: ReadonlyArray<esbuild.Plugin> },
): Effect.fn.Return<Bundled, BundlerError, Path.Path | FileSystem.FileSystem> {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;

  const batch = yield* Effect.serviceOption(Batch);
  if (
    Option.isSome(batch) &&
    !options?.plugins?.length &&
    batch.value.entryPoints.some(
      (entry) => path.resolve(entry) === path.resolve(entryPoint),
    )
  ) {
    const compilation = yield* batch.value.compilation;
    if (Option.isSome(compilation)) {
      const entry = HashMap.get(
        compilation.value.entries,
        path.resolve(entryPoint),
      );
      if (Option.isSome(entry)) {
        const metafile = entryMetafile(
          path,
          compilation.value,
          entry.value.source,
          entry.value.output,
        );
        const module = yield* Effect.tryPromise({
          try: () =>
            dynamicImport(pathToFileURL(entry.value.output).href, {
              format: "esm",
            }),
          catch: (cause) => new BundlerError({ cause }),
        }).pipe(
          Effect.ensuring(
            logCoalescedBuildWarnings(
              compilation.value.warnings.filter(
                (warning) =>
                  warning.location &&
                  metafile.inputs[
                    path.resolve(compilation.value.cwd, warning.location.file)
                  ],
              ),
            ),
          ),
        );
        return { module, metafile };
      }
    }
  }

  const buildResultRef = yield* Ref.make<CapturedBuildResult>({
    metafile: undefined,
    warnings: [],
  });

  const cwd = path.dirname(entryPoint);
  const skipPatterns = yield* Effect.try({
    try: () =>
      tsconfigPathsToRegExp(
        loadTsConfig(cwd)?.data.compilerOptions?.paths ?? {},
      ),
    catch: (cause) => new BundlerError({ cause }),
  });
  const result = yield* Effect.tryPromise({
    try: () =>
      bundleRequire({
        filepath: entryPoint,
        cwd,
        format: "esm",
        esbuildOptions: {
          plugins: [
            ...(options?.plugins ?? []),
            bundleWorkspacePlugin(path, fs, skipPatterns),
            captureBuildResultPlugin(buildResultRef),
          ],
          logLevel: "silent",
        },
      }),
    catch: (cause) => new BundlerError({ cause }),
  }).pipe(
    Effect.ensuring(
      Effect.andThen(Ref.get(buildResultRef), (captured) =>
        logCoalescedBuildWarnings(captured.warnings),
      ),
    ),
  );

  const { metafile } = yield* Ref.get(buildResultRef);
  if (!metafile) {
    return yield* Effect.die(new Error("esbuild metafile missing"));
  }

  return {
    module: result.mod,
    metafile: absolutizeMetafile(path, metafile, cwd),
  };
});

const findMetafileInputKey = Effect.fnUntraced(function* (
  metafile: esbuild.Metafile,
  absolutePath: string,
) {
  const path = yield* Path.Path;
  const resolved = path.resolve(absolutePath);
  return Array.findFirst(
    Object.keys(metafile.inputs),
    (key) => path.resolve(key) === resolved,
  );
});

/**
 * Returns `true` when the module bundled from `sourceAbsolutePath` declares a
 * direct import of `targetAbsolutePath` (according to the bundle's esbuild
 * metafile). Returns `false` if either path is missing from the metafile.
 */
export const directlyImports = Effect.fnUntraced(function* (
  bundled: Bundled,
  sourceAbsolutePath: string,
  targetAbsolutePath: string,
) {
  const path = yield* Path.Path;
  const sourceKey = yield* findMetafileInputKey(
    bundled.metafile,
    sourceAbsolutePath,
  );
  const targetKey = yield* findMetafileInputKey(
    bundled.metafile,
    targetAbsolutePath,
  );

  return pipe(
    Option.all([sourceKey, targetKey]),
    Option.flatMap(([sourceKey_, targetKey_]) =>
      Option.fromNullishOr(bundled.metafile.inputs[sourceKey_]).pipe(
        Option.map((sourceInput) => {
          const targetResolved = path.resolve(targetKey_);
          return sourceInput.imports.some(
            (importedFile) =>
              path.resolve(importedFile.path) === targetResolved,
          );
        }),
      ),
    ),
    Option.getOrElse(() => false),
  );
});

/**
 * Returns the absolute paths of every module in the bundle that declares a
 * direct import of `packageName` (the package itself or one of its subpaths)
 * and satisfies `where`. Use `where` to restrict the search to the modules you
 * care about—the bundle's inputs include every transitive dependency.
 *
 * Matching is on the specifier as written rather than the resolved path,
 * because {@link bundleWorkspacePlugin} bundles first-party workspace
 * dependencies (so `@confect/server` resolves to a path inside the monorepo)
 * while a published install externalizes them (so it stays a bare specifier).
 * esbuild erases `import type` before it produces the metafile, so type-only
 * imports are not reported.
 */
export const importersOfPackage = (
  bundled: Bundled,
  packageName: string,
  where: (absolutePath: string) => boolean,
): ReadonlyArray<string> => {
  const subpathPrefix = `${packageName}/`;

  return Object.entries(bundled.metafile.inputs)
    .filter(
      ([absolutePath, input]) =>
        where(absolutePath) &&
        input.imports.some(
          (imported) =>
            imported.original === packageName ||
            imported.original?.startsWith(subpathPrefix) === true,
        ),
    )
    .map(([absolutePath]) => absolutePath);
};
