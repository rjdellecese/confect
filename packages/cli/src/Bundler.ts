import { createRequire, isBuiltin } from "node:module";
import {
  bundleRequire,
  loadTsConfig,
  tsconfigPathsToRegExp,
} from "bundle-require";
import { resolveModulePath } from "exsolve";
import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as String from "effect/String";
import type * as esbuild from "esbuild";
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
 * absolute up front. That way the lookup logic stays oblivious to whatever
 * cwd was used during bundling.
 *
 * `original` (the specifier as written, before resolution) is filled in from
 * `path` when esbuild omits it — esbuild only sets it when it differs from the
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
    path.isAbsolute(p) ? p : path.resolve(cwd, p);
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
 * outside `node_modules` — mirroring Vite's "linked dependencies are not
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

/**
 * Bundle a TypeScript entry point with esbuild via {@link bundleRequire} and
 * import the result. `bundle-require` writes a temp `.mjs` next to the source,
 * `import()`s it, and deletes it — so third-party `node_modules` externals
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
 * `options.plugins` are registered ahead of every other plugin — including
 * `bundle-require`'s own `externalPlugin` — so a caller-supplied plugin can
 * claim resolutions (e.g. `convex.config` imports) before the workspace and
 * externalization heuristics see them.
 */
export const bundle = Effect.fn("Bundler.bundle")(function* (
  entryPoint: string,
  options?: { readonly plugins?: ReadonlyArray<esbuild.Plugin> },
): Effect.fn.Return<Bundled, BundlerError, Path.Path | FileSystem.FileSystem> {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;

  const buildResultRef = yield* Ref.make<CapturedBuildResult>({
    metafile: undefined,
    warnings: [],
  });

  const cwd = path.dirname(entryPoint);
  const skipPatterns = tsconfigPathsToRegExp(
    loadTsConfig(cwd)?.data.compilerOptions?.paths ?? {},
  );
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
 * care about — the bundle's inputs include every transitive dependency.
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
