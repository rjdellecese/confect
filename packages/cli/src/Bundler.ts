import { createRequire, isBuiltin } from "node:module";
import * as Lazy from "@confect/core/Lazy";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  bundleRequire,
  injectFileScopePlugin,
  JS_EXT_RE,
  loadTsConfig,
  tsconfigPathsToRegExp,
} from "bundle-require";
import { resolveModulePath } from "exsolve";
import { identity, pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Chunk from "effect/Chunk";
import * as Cause from "effect/Cause";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Iterable from "effect/Iterable";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Record from "effect/Record";
import * as Scope from "effect/Scope";
import * as Schema from "effect/Schema";
import * as String from "effect/String";
import * as esbuild from "esbuild";
import { BundlerError } from "./BuildError";
import * as CompiledModule from "./CompiledModule";
import * as Compilation from "./Compilation";
import * as CompilationPlugin from "./CompilationPlugin";
import * as CompilationState from "./CompilationState";
import { logCoalescedBuildWarnings } from "./log";

export type Bundled = CompiledModule.LoadedModule;

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
  const absolutize = (p: string) =>
    path.resolve(cwd, CompilationPlugin.physicalPath(p));
  const inputs = Record.mapEntries(metafile.inputs, (value, key) => [
    absolutize(key),
    {
      ...value,
      imports: Array.map(value.imports, (i) => ({
        ...i,
        path: absolutize(i.path),
        original: i.original ?? i.path,
      })),
    },
  ]);
  const outputs = Record.mapEntries(metafile.outputs, (value, key) => [
    absolutize(key),
    {
      ...value,
      ...(value.entryPoint ? { entryPoint: absolutize(value.entryPoint) } : {}),
      inputs: Record.mapKeys(value.inputs, absolutize),
      imports: Array.map(value.imports, (imported) =>
        imported.external
          ? imported
          : { ...imported, path: absolutize(imported.path) },
      ),
    },
  ]);
  return { inputs, outputs };
};

const resolveEsm = Option.liftThrowable((specifier: string, importer: string) =>
  resolveModulePath(specifier, {
    from: importer,
    conditions: ["node", "import"],
    cache: false,
  }),
);

const resolveCjs = Option.liftThrowable((specifier: string, importer: string) =>
  createRequire(importer).resolve(specifier),
);

const resolveExternalEsm = Option.liftThrowable(
  (specifier: string, importer: string, conditions: string[]) =>
    resolveModulePath(specifier, { from: importer, conditions, cache: false }),
);

export const resolveModule = (
  specifier: string,
  importer: string,
): Option.Option<string> =>
  Option.orElse(resolveEsm(specifier, importer), () =>
    resolveCjs(specifier, importer),
  );

export const packageSelfReferencePatterns = Effect.fnUntraced(
  function* (directory: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const start = path.resolve(directory);
    const root = path.parse(start).root;
    const directories = Array.append(
      Array.unfold(start, (current) =>
        current === root
          ? Option.none()
          : Option.some([current, path.dirname(current)] as const),
      ),
      root,
    );
    const nearest = yield* Effect.findFirst(directories, (current) =>
      fs.exists(path.join(current, "package.json")),
    );
    if (Option.isNone(nearest)) return [];
    const contents = yield* fs.readFileString(
      path.join(nearest.value, "package.json"),
    );
    const metadata = yield* Schema.decodeEffect(
      Schema.fromJsonString(
        Schema.Struct({
          name: Schema.optionalKey(Schema.String),
          exports: Schema.optionalKey(Schema.Unknown),
        }),
      ),
    )(contents);
    return metadata.name && metadata.exports != null
      ? [
          new RegExp(
            `^${metadata.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/|$)`,
          ),
        ]
      : [];
  },
  Effect.mapError((cause) => new BundlerError({ cause })),
);

/**
 * Bundles first-party workspace dependencies that `bundle-require` would
 * otherwise externalize and hand to Node's native ESM resolver. Resolves each
 * bare specifier and, following symlinks, bundles it when its real path lives
 * outside `node_modules`—mirroring Vite's "linked dependencies are not
 * externalized" heuristic. Registered ahead of `externalPlugin`, so deferring
 * (returning `undefined`) leaves third-party externalization untouched.
 * `skipPatterns` leave tsconfig `paths` aliases and package self-references to
 * esbuild's native resolution.
 */
export const bundleWorkspacePlugin = (
  path: Path.Path,
  fs: FileSystem.FileSystem,
  skipPatterns: ReadonlyArray<RegExp>,
): esbuild.Plugin => ({
  name: "confect:bundle-workspace",
  setup(build) {
    build.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.pluginData === CompilationPlugin.nativeProbe) return undefined;
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
  readonly receipt?: CompilationState.Receipt;
  readonly entries: HashMap.HashMap<
    string,
    { readonly source: string; readonly output: string }
  >;
  readonly metafile: esbuild.Metafile;
  readonly warnings: ReadonlyArray<esbuild.Message>;
  readonly cwd: string;
}

class BatchIncompatible extends Schema.TaggedError<BatchIncompatible>()(
  "BatchIncompatible",
  {
    reason: Schema.Literals([
      "RuntimeConditions",
      "UnsupportedEntries",
      "MixedTsconfigs",
      "UnattributedWarnings",
    ]),
    message: Schema.String,
  },
) {}

class Batch extends Context.Service<
  Batch,
  {
    readonly entryPoints: HashSet.HashSet<string>;
    readonly compilation: Effect.Effect<
      Option.Option<BatchCompilation>,
      BundlerError | CompilationState.Failed,
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
          Option.match(
            resolveExternalEsm(args.path, args.importer, conditions),
            {
              onNone: () => args.path,
              onSome: (resolvedPath) => pathToFileURL(resolvedPath).href,
            },
          ),
        );
      });
    });
  },
});

const compileLive = Effect.fn("Bundler.compileLive")(
  function* (
    service: Compilation.Service["Service"],
    entryPoints: ReadonlyArray<string>,
    batch: boolean,
    options?: {
      readonly plugins?: ReadonlyArray<esbuild.Plugin>;
      readonly profile?: "component-config";
    },
  ) {
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    if (options?.plugins?.length && options.profile !== "component-config") {
      return yield* new BundlerError({
        cause: { _tag: "UnsupportedCompilationProfile" },
      });
    }
    const nodeOptions = yield* Config.String("NODE_OPTIONS").pipe(
      Config.withDefault(""),
    );
    if (/--conditions|-C|--(?:no-)?addons/.test(nodeOptions)) {
      return yield* new BundlerError({
        cause: {
          _tag: "UnsupportedCompilationRuntimeOptions",
          option: "NODE_OPTIONS",
        },
      });
    }
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
    const entries = Array.dedupe(
      Array.map(entryPoints, (entry) => path.resolve(entry)),
    );
    const first = entries[0];
    if (!first)
      return yield* new BundlerError({ cause: { _tag: "EmptyCompilation" } });
    const cwd = yield* Compilation.canonicalPath(path.dirname(first));
    const roots = yield* Effect.forEach(entries, Compilation.canonicalPath);
    const conditions = [
      "node",
      ...(process.features.require_module ? ["module-sync"] : []),
      ...(runtimeOptions["no-addons"] ? [] : ["node-addons"]),
      ...Array.filter(
        runtimeOptions.conditions ?? [],
        (condition) => typeof condition === "string",
      ),
    ];
    const resolver = yield* CompilationPlugin.make(
      path,
      fs,
      service.ownedDirectories,
      service.authoredFiles,
      conditions,
      service.resolutionInputs,
    );
    const result = yield* service.compile({
      roots,
      profile: options?.profile ?? "modules",
      options: {
        entryPoints: Array.map(roots, (entry, index) => ({
          in: entry,
          out: `${index}`,
        })),
        absWorkingDir: cwd,
        outExtension: { ".js": ".mjs" },
        chunkNames: "chunk-[hash]",
        format: "esm",
        platform: "node",
        mainFields: ["main"],
        sourcemap: "inline",
        bundle: true,
        splitting: batch,
        logLevel: "silent",
        conditions,
        plugins: [...(options?.plugins ?? []), resolver.plugin],
      },
      normalize: (metafile) =>
        absolutizeMetafile(path, resolver.normalize(metafile, cwd), cwd),
    });
    const artifacts = yield* Effect.forEach(
      Array.zip(entries, roots),
      ([entry, source]) =>
        Effect.gen(function* () {
          const output = Array.findFirst(
            Record.toEntries(result.metafile.outputs),
            ([, metadata]) => metadata.entryPoint === source,
          );
          if (Option.isNone(output))
            return yield* new BundlerError({
              cause: { _tag: "MissingCompilationOutput", entry },
            });
          return [entry, { source, output: output.value[0] }] as const;
        }),
    );
    return {
      receipt: result.receipt,
      entries: HashMap.fromIterable(artifacts),
      metafile: result.metafile,
      warnings: result.warnings,
      cwd,
    } satisfies BatchCompilation;
  },
  Effect.mapError((cause) =>
    Schema.is(BundlerError)(cause) || Schema.is(CompilationState.Failed)(cause)
      ? cause
      : new BundlerError({ cause }),
  ),
);

const compileBatch = Effect.fn("Bundler.compileBatch")(function* (
  entryPoints: ReadonlyArray<string>,
) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const nodeOptions = yield* Config.String("NODE_OPTIONS").pipe(
    Config.withDefault(""),
  );
  if (/--conditions|-C|--(?:no-)?addons/.test(nodeOptions))
    return yield* new BatchIncompatible({
      reason: "RuntimeConditions",
      message:
        "NODE_OPTIONS changes Node export conditions; individual builds preserve native resolution.",
    });
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
    return yield* new BatchIncompatible({
      reason: "UnsupportedEntries",
      message:
        "Shared builds require JavaScript or TypeScript entries outside node_modules.",
    });
  }
  const configs = yield* Effect.try({
    try: () => entries.map((entry) => loadTsConfig(path.dirname(entry))),
    catch: (cause) => new BundlerError({ cause }),
  });
  const config = configs[0];
  if (configs.some((other) => other?.path !== config?.path))
    return yield* new BatchIncompatible({
      reason: "MixedTsconfigs",
      message: `Entries use different tsconfigs: ${Array.dedupe(configs.map((item) => item?.path ?? "(no tsconfig)")).join(", ")}`,
    });

  const cwd = yield* fs.realPath(path.dirname(first));
  const directory = yield* fs
    .makeTempDirectoryScoped({ prefix: "confect-batch-" })
    .pipe(Effect.flatMap((temporary) => fs.realPath(temporary)));
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
  const selfReferences = (yield* Effect.forEach(
    Array.dedupe(entries.map((entry) => path.dirname(entry))),
    packageSelfReferencePatterns,
  )).flat();
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
            [
              ...tsconfigPathsToRegExp(
                config?.data.compilerOptions?.paths ?? {},
              ),
              ...selfReferences,
            ],
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
  const unattributedWarnings = result.warnings.filter(
    (warning) =>
      !warning.location ||
      !HashSet.has(inputPaths, path.resolve(cwd, warning.location.file)),
  );
  if (unattributedWarnings.length > 0)
    return yield* new BatchIncompatible({
      reason: "UnattributedWarnings",
      message: `Cannot attribute build warnings to entries: ${unattributedWarnings.map((warning) => warning.text).join("; ")}`,
    });
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
  return {
    entries: HashMap.fromIterable(artifacts),
    metafile: absolutizeMetafile(path, { ...result.metafile, inputs }, cwd),
    warnings: result.warnings,
    cwd,
  } satisfies BatchCompilation;
});

/**
 * Lazily shares one compilation across ordinary bundle calls in this effect.
 * Different tsconfigs and failed compilations fall back to individual builds.
 * Runtime conditions supplied through NODE_OPTIONS also use individual builds.
 * Imports still run at each caller. Temporary chunks live until the supplied
 * artifact scope closes, or until this effect finishes for standalone callers.
 * The disposable evaluator, not this scope, owns Node's import cache.
 */
export const withBatch = <A, E, R>(
  entryPoints: ReadonlyArray<string>,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | Path.Path> =>
  Effect.scopedWith((scope) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const entryKeys = HashSet.fromIterable(
        entryPoints.map((entry) => path.resolve(entry)),
      );
      const current = yield* Effect.serviceOption(Batch);
      if (
        Option.isSome(current) &&
        HashSet.isSubset(entryKeys, current.value.entryPoints)
      )
        return yield* effect;
      const artifactScope = yield* Effect.serviceOption(
        CompiledModule.ArtifactScope,
      );
      const live = yield* Effect.serviceOption(Compilation.Service);
      const compilation = yield* Effect.cached(
        (Option.isSome(live)
          ? compileLive(live.value, entryPoints, true).pipe(Effect.asSome)
          : compileBatch(entryPoints).pipe(
              Effect.asSome,
              Effect.catchTag("BatchIncompatible", (error) =>
                Effect.logDebug(
                  "Shared build skipped; falling back to individual builds.",
                  { entryPoints, reason: error.reason, detail: error.message },
                ).pipe(Effect.as(Option.none<BatchCompilation>())),
              ),
              Effect.catch((error) =>
                Effect.logDebug(
                  "Shared build failed; falling back to individual builds.",
                  { entryPoints, reason: "CompileFailure" },
                  Cause.fail(error),
                ).pipe(Effect.as(Option.none<BatchCompilation>())),
              ),
            )
        ).pipe(
          Effect.provideService(
            Scope.Scope,
            Option.getOrElse(artifactScope, () => scope),
          ),
        ),
      );
      return yield* Effect.provideService(effect, Batch, {
        entryPoints: entryKeys,
        compilation,
      });
    }),
  );

interface MetafileTraversal {
  readonly pending: Chunk.Chunk<string>;
  readonly visited: HashSet.HashSet<string>;
}

const reachableMetafileEntries = <
  Metadata extends {
    readonly imports: ReadonlyArray<{
      readonly path: string;
      readonly external?: boolean;
    }>;
  },
>(
  entries: Readonly<Record<string, Metadata>>,
  root: string,
  resolveImport: (path: string) => string,
): Record<string, Metadata> =>
  Object.fromEntries(
    pipe(
      Iterable.unfold<
        MetafileTraversal,
        Option.Option<readonly [string, Metadata]>
      >(
        { pending: Chunk.of(root), visited: HashSet.empty() },
        ({ pending, visited }) => {
          if (!Chunk.isNonEmpty(pending)) return Option.none();
          const key = Chunk.headNonEmpty(pending);
          const remaining = Chunk.tailNonEmpty(pending);
          const metadata = entries[key];
          if (HashSet.has(visited, key) || metadata === undefined)
            return Option.some([
              Option.none(),
              { pending: remaining, visited },
            ]);
          return Option.some([
            Option.some([key, metadata] as const),
            {
              pending: Array.reduce(
                metadata.imports,
                remaining,
                (queue, imported) =>
                  imported.external
                    ? queue
                    : Chunk.append(queue, resolveImport(imported.path)),
              ),
              visited: HashSet.add(visited, key),
            },
          ]);
        },
      ),
      Iterable.getSomes,
    ),
  );

const entryMetafile = (
  path: Path.Path,
  compilation: BatchCompilation,
  source: string,
  output: string,
): esbuild.Metafile => {
  const metafile = {
    inputs: reachableMetafileEntries(
      compilation.metafile.inputs,
      source,
      identity,
    ),
    outputs: compilation.metafile.outputs,
  };
  Lazy.defineProperty(metafile, "outputs", () =>
    reachableMetafileEntries(compilation.metafile.outputs, output, (key) =>
      path.resolve(compilation.cwd, key),
    ),
  );
  return metafile;
};

const entryArtifact = (
  path: Path.Path,
  compilation: BatchCompilation,
  source: string,
  output: string,
): CompiledModule.CompiledModule => {
  const metafile = entryMetafile(path, compilation, source, output);
  return {
    url: pathToFileURL(output).href,
    ...(compilation.receipt
      ? { origin: { ...compilation.receipt, roots: [source] } }
      : {}),
    metafile,
    warnings: Array.filter(compilation.warnings, (warning) => {
      if (!warning.location) return true;
      const file = path.resolve(
        compilation.cwd,
        CompilationPlugin.physicalPath(warning.location.file),
      );
      return (
        compilation.metafile.inputs[file] === undefined ||
        metafile.inputs[file] !== undefined
      );
    }),
  };
};

/**
 * Compile a TypeScript entry point with esbuild via {@link bundleRequire}. The
 * temporary artifact lives under the source directory until scope closure, so
 * third-party `node_modules` externals resolve through the user's normal
 * `node_modules` walk, while first-party workspace deps are bundled by
 * {@link bundleWorkspacePlugin} and tsconfig `paths` aliases stay inside the
 * bundle.
 *
 * `cwd` is set to the entry's directory so `bundle-require`'s `tsconfig.json`
 * discovery (which walks upward from `cwd`) lands on the project's tsconfig
 * regardless of where `confect codegen` was invoked from, and so esbuild
 * resolves relative imports against the entry's location.
 *
 * The returned artifact carries its import URL and the esbuild metafile so
 * callers can inspect the import graph before evaluating the module; the
 * metafile is captured via a small `onEnd` plugin because `bundle-require`
 * itself only exposes a flat `dependencies: string[]`.
 *
 * `options.plugins` are registered ahead of every other plugin—including
 * `bundle-require`'s own `externalPlugin`—so a caller-supplied plugin can claim
 * resolutions (e.g. `convex.config` imports) before the workspace and
 * externalization heuristics see them.
 */
export const compile = Effect.fn("Bundler.compile")(function* (
  entryPoint: string,
  options?: {
    readonly plugins?: ReadonlyArray<esbuild.Plugin>;
    readonly profile?: "component-config";
  },
): Effect.fn.Return<
  CompiledModule.CompiledModule,
  BundlerError,
  Path.Path | FileSystem.FileSystem | Scope.Scope
> {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;

  const batch = yield* Effect.serviceOption(Batch);
  if (
    Option.isSome(batch) &&
    !options?.plugins?.length &&
    HashSet.has(batch.value.entryPoints, path.resolve(entryPoint))
  ) {
    const compilation = yield* batch.value.compilation.pipe(
      Effect.catchTag(
        "CompilationFailed",
        Compilation.fail(path.resolve(entryPoint)),
      ),
    );
    if (Option.isSome(compilation)) {
      const entry = HashMap.get(
        compilation.value.entries,
        path.resolve(entryPoint),
      );
      if (Option.isSome(entry)) {
        return entryArtifact(
          path,
          compilation.value,
          entry.value.source,
          entry.value.output,
        );
      }
    }
  }

  const live = yield* Effect.serviceOption(Compilation.Service);
  if (Option.isSome(live)) {
    const artifactScope = yield* Effect.serviceOption(
      CompiledModule.ArtifactScope,
    );
    const scope = Option.isSome(artifactScope)
      ? artifactScope.value
      : yield* Scope.Scope;
    const compilation = yield* compileLive(
      live.value,
      [entryPoint],
      false,
      options,
    ).pipe(
      Effect.provideService(Scope.Scope, scope),
      Effect.catchTag(
        "CompilationFailed",
        Compilation.fail(path.resolve(entryPoint)),
      ),
    );
    const entry = HashMap.get(compilation.entries, path.resolve(entryPoint));
    if (Option.isNone(entry))
      return yield* new BundlerError({
        cause: { _tag: "MissingCompilationOutput", entryPoint },
      });
    return entryArtifact(
      path,
      compilation,
      entry.value.source,
      entry.value.output,
    );
  }

  const buildResultRef = yield* Ref.make<CapturedBuildResult>({
    metafile: undefined,
    warnings: [],
  });

  const cwd = path.dirname(entryPoint);
  const selfReferences = yield* packageSelfReferencePatterns(cwd);
  const nativePatterns =
    options?.profile === "component-config"
      ? [...selfReferences, CompilationPlugin.componentPattern]
      : selfReferences;
  const artifactScope = yield* Effect.serviceOption(
    CompiledModule.ArtifactScope,
  );
  const scope = Option.isSome(artifactScope)
    ? artifactScope.value
    : yield* Scope.Scope;
  const directory = yield* fs
    .makeTempDirectoryScoped({
      directory: cwd,
      prefix: ".confect-bundle-",
    })
    .pipe(
      Effect.provideService(Scope.Scope, scope),
      Effect.mapError((cause) => new BundlerError({ cause })),
    );
  const skipPatterns = yield* Effect.try({
    try: () => [
      ...tsconfigPathsToRegExp(
        loadTsConfig(cwd)?.data.compilerOptions?.paths ?? {},
      ),
      ...nativePatterns,
    ],
    catch: (cause) => new BundlerError({ cause }),
  });
  const result = yield* Effect.tryPromise({
    try: () =>
      bundleRequire<string>({
        filepath: entryPoint,
        cwd,
        format: "esm",
        notExternal: nativePatterns,
        require: (url) => url,
        getOutputFile: () => path.join(directory, "entry.mjs"),
        preserveTemporaryFile: true,
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
    Effect.tapError(() =>
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
    url: result.mod,
    metafile: absolutizeMetafile(path, metafile, cwd),
    warnings: (yield* Ref.get(buildResultRef)).warnings,
  };
});

export const bundle = Effect.fn("Bundler.bundle")(
  (
    entryPoint: string,
    options?: {
      readonly plugins?: ReadonlyArray<esbuild.Plugin>;
      readonly profile?: "component-config";
    },
  ) =>
    compile(entryPoint, options).pipe(
      Effect.flatMap(CompiledModule.load),
      Effect.scoped,
    ),
);

const findMetafileInputKey = Effect.fnUntraced(function* (
  metafile: esbuild.Metafile,
  absolutePath: string,
) {
  const path = yield* Path.Path;
  const resolved = path.resolve(absolutePath);
  if (metafile.inputs[resolved] !== undefined) return Option.some(resolved);
  const fs = yield* FileSystem.FileSystem;
  const real = yield* fs
    .realPath(resolved)
    .pipe(Effect.orElseSucceed(() => resolved));
  return Array.findFirst(
    Object.keys(metafile.inputs),
    (key) => path.resolve(key) === real,
  );
});

/**
 * Returns `true` when the module bundled from `sourceAbsolutePath` declares a
 * direct import of `targetAbsolutePath` (according to the bundle's esbuild
 * metafile). Returns `false` if either path is missing from the metafile.
 */
export const directlyImports = Effect.fnUntraced(function* (
  bundled: Pick<Bundled, "metafile">,
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
  bundled: Pick<Bundled, "metafile">,
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
