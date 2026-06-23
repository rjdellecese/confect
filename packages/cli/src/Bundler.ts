import { realpathSync } from "node:fs";
import { createRequire, isBuiltin } from "node:module";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
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
 * esbuild plugin that bundles first-party **workspace** dependencies instead of
 * letting `bundle-require` externalize them.
 *
 * `bundle-require`'s own `externalPlugin` decides externalization from the
 * import specifier string, so every bare specifier — including a `workspace:`
 * package consumed via `exports`→`dist` — is externalized and handed to Node's
 * native ESM resolver when the temp `.mjs` is `import()`ed. Node ESM requires
 * fully-specified relative imports, so a workspace package whose `dist` uses
 * extensionless/directory relative imports (valid for every bundler/loader)
 * fails with `ERR_MODULE_NOT_FOUND`.
 *
 * This mirrors Vite's SSR heuristic ("only linked dependencies are not
 * externalized"): resolve each bare specifier with Node's resolver, follow
 * symlinks to its real path, and bundle it when that real path lives **outside**
 * any `node_modules` directory (a linked workspace / `file:` / `link:` package).
 * `realpathSync` is load-bearing — pnpm/npm/yarn symlink workspace packages
 * *into* `node_modules`, so the pre-symlink path still contains `node_modules`;
 * only the de-symlinked target (e.g. `packages/lib/dist/…`) reveals it as
 * first-party. Everything else returns `undefined` so `bundle-require`'s
 * `externalPlugin` still externalizes true third-party deps (with a `file://`
 * URL) exactly as before.
 *
 * Registered ahead of `externalPlugin` (esbuild's first `onResolve` to return a
 * result wins). `skipPatterns` carries the tsconfig `paths` regexes so aliases
 * that also resolve as packages keep deferring to esbuild's `paths` resolution.
 */
export const bundleWorkspacePlugin = (
  skipPatterns: ReadonlyArray<RegExp>,
): esbuild.Plugin => ({
  name: "confect:bundle-workspace",
  setup(build) {
    // Bare specifiers only: skip relative (`.`) and absolute-POSIX (`/`)
    // specifiers, which esbuild bundles natively anyway.
    build.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.namespace !== "file" && args.namespace !== "") return undefined;
      if (isBuiltin(args.path) || isAbsolute(args.path)) return undefined;
      if (skipPatterns.some((pattern) => pattern.test(args.path))) {
        return undefined;
      }

      const importer =
        args.importer !== "" ? args.importer : join(args.resolveDir, "_");

      let resolved: string;
      try {
        resolved = createRequire(importer).resolve(args.path);
      } catch {
        // Not Node-resolvable as a package (e.g. a tsconfig `paths` alias) —
        // let esbuild / `externalPlugin` handle it.
        return undefined;
      }

      let real: string;
      try {
        real = realpathSync(resolved);
      } catch {
        real = resolved;
      }

      const insideNodeModules = real.split(sep).includes("node_modules");
      // First-party (real path outside node_modules) → bundle. Third-party →
      // defer so `externalPlugin` externalizes it with a proper `file://` URL.
      return insideNodeModules ? undefined : { path: real };
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
    // Mirror `bundle-require`'s own tsconfig discovery so a `paths` alias that
    // also resolves as a package keeps deferring to esbuild's `paths`
    // resolution instead of being claimed by `bundleWorkspacePlugin`.
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
            plugins: [bundleWorkspacePlugin(skipPatterns), captureMetafile],
            logLevel: "silent",
          },
        }),
      catch: (cause) => new BundlerError({ cause }),
    });

    if (!metafile) {
      return yield* Effect.dieMessage("esbuild metafile missing");
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
