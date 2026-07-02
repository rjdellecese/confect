import { dirname, isAbsolute, resolve } from "node:path";
import * as Path from "effect/Path";
import { bundleRequire } from "bundle-require";
import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
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
  metafile: esbuild.Metafile,
  cwd: string,
): esbuild.Metafile => {
  const absolutize = (p: string) => (isAbsolute(p) ? p : resolve(cwd, p));
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

/**
 * Bundle a TypeScript entry point with esbuild via {@link bundleRequire} and
 * import the result. `bundle-require` writes a temp `.mjs` next to the source,
 * `import()`s it, and deletes it — so bare-specifier externals (third-party
 * packages, workspace deps) resolve through the user's normal `node_modules`
 * walk, and tsconfig `paths` aliases stay inside the bundle.
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
): Effect.Effect<Bundled, BundlerError> =>
  Effect.gen(function* () {
    let metafile: esbuild.Metafile | undefined;
    const captureMetafile: esbuild.Plugin = {
      name: "confect:capture-metafile",
      setup(build) {
        build.onEnd((result) => {
          metafile = result.metafile;
        });
      },
    };

    const cwd = dirname(entryPoint);
    const result = yield* Effect.tryPromise({
      try: () =>
        bundleRequire({
          filepath: entryPoint,
          cwd,
          format: "esm",
          esbuildOptions: {
            plugins: [captureMetafile],
            logLevel: "silent",
          },
        }),
      catch: (cause) => new BundlerError({ cause }),
    });

    if (!metafile) {
      return yield* Effect.die(new Error("esbuild metafile missing"));
    }

    return { module: result.mod, metafile: absolutizeMetafile(metafile, cwd) };
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
