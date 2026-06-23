import { realpathSync } from "node:fs";
import { createRequire, isBuiltin } from "node:module";
import * as Path from "@effect/platform/Path";
import {
  bundleRequire,
  loadTsConfig,
  tsconfigPathsToRegExp,
} from "bundle-require";
import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as String from "effect/String";
import type * as esbuild from "esbuild";
import { BundlerError } from "./BuildError";

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
        Object.assign({}, i, { path: absolutize(i.path) }),
      ),
    };
  }
  const outputs: esbuild.Metafile["outputs"] = {};
  for (const [key, value] of Object.entries(metafile.outputs)) {
    outputs[absolutize(key)] = value;
  }
  return { inputs, outputs };
};

const resolveModule = Option.liftThrowable(
  (specifier: string, importer: string) =>
    createRequire(importer).resolve(specifier),
);

const realPath = Option.liftThrowable((path: string) => realpathSync(path));

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

      return pipe(
        resolveModule(args.path, importer),
        Option.map((resolved) =>
          Option.getOrElse(realPath(resolved), () => resolved),
        ),
        Option.filter(
          (real) =>
            !pipe(real, String.split(path.sep), Array.contains("node_modules")),
        ),
        Option.map((real) => ({ path: real })),
        Option.getOrUndefined,
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
 */
export const bundle = (
  entryPoint: string,
): Effect.Effect<Bundled, BundlerError, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    let metafile: esbuild.Metafile | undefined;
    const captureMetafile: esbuild.Plugin = {
      name: "confect:capture-metafile",
      setup(build) {
        build.onEnd((result) => {
          metafile = result.metafile;
        });
      },
    };

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
              bundleWorkspacePlugin(path, skipPatterns),
              captureMetafile,
            ],
            logLevel: "silent",
          },
        }),
      catch: (cause) => new BundlerError({ cause }),
    });

    if (!metafile) {
      return yield* Effect.dieMessage("esbuild metafile missing");
    }

    return {
      module: result.mod,
      metafile: absolutizeMetafile(path, metafile, cwd),
    };
  });

const findMetafileInputKey = (
  metafile: esbuild.Metafile,
  absolutePath: string,
) =>
  Effect.gen(function* () {
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
export const directlyImports = (
  bundled: Bundled,
  sourceAbsolutePath: string,
  targetAbsolutePath: string,
) =>
  Effect.gen(function* () {
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
        Option.fromNullable(bundled.metafile.inputs[sourceKey_]).pipe(
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
