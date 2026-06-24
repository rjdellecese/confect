import { realpathSync } from "node:fs";
import { createRequire, isBuiltin } from "node:module";
import * as Path from "@effect/platform/Path";
import {
  bundleRequire,
  loadTsConfig,
  tsconfigPathsToRegExp,
} from "bundle-require";
import { resolveModulePath } from "exsolve";
import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as String from "effect/String";
import type * as esbuild from "esbuild";
import { BundlerError, logCoalescedBuildWarnings } from "./BuildError";

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

const resolveEsm = Option.liftThrowable((specifier: string, importer: string) =>
  resolveModulePath(specifier, {
    from: importer,
    conditions: ["node", "import"],
  }),
);

const resolveCjs = Option.liftThrowable((specifier: string, importer: string) =>
  createRequire(importer).resolve(specifier),
);

/**
 * Resolve a bare specifier from `importer`, honoring ESM `import` export
 * conditions first and falling back to CommonJS resolution. `createRequire`
 * alone can't see an `exports` map that declares only `import` (no
 * `require`/`default`): it throws `ERR_PACKAGE_PATH_NOT_EXPORTED`, which
 * previously forced ESM-only workspace deps to be externalized and then fail
 * under raw Node ESM. {@link resolveEsm} (exsolve, the same algorithm Node uses
 * for ESM) resolves those, while the {@link resolveCjs} fallback still covers
 * packages reachable only through a `require` condition.
 */
const resolveModule = (
  specifier: string,
  importer: string,
): Option.Option<string> =>
  Option.orElse(resolveEsm(specifier, importer), () =>
    resolveCjs(specifier, importer),
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

      return Option.match(resolveModule(args.path, importer), {
        // Neither ESM nor CJS resolution found the specifier. Externalizing
        // silently (the previous behavior) hands it to raw Node ESM, which
        // fails later with an opaque `ERR_MODULE_NOT_FOUND` against the dep's
        // internals. Warn about the dependency we couldn't bundle, then still
        // externalize so a genuinely-external specifier keeps working.
        onNone: () => ({
          path: args.path,
          external: true,
          warnings: [
            {
              text: `Confect could not resolve workspace dependency "${args.path}" (imported from ${importer}) to bundle it; leaving it external.`,
            },
          ],
        }),
        onSome: (resolved) => {
          const real = Option.getOrElse(realPath(resolved), () => resolved);
          return pipe(
            real,
            String.split(path.sep),
            Array.contains("node_modules"),
          )
            ? // Third-party: defer to the external plugin.
              undefined
            : // First-party workspace dep: bundle it.
              { path: real };
        },
      });
    });
  },
});

interface CapturedBuildResult {
  readonly metafile: esbuild.Metafile | undefined;
  readonly warnings: ReadonlyArray<esbuild.Message>;
}

/**
 * `bundle-require` only exposes a flat `dependencies: string[]`, so this small
 * plugin captures the esbuild build result (metafile and warnings) into `ref`
 * via `onEnd`. Defined outside {@link bundle}'s `Effect.gen` so the
 * `onEnd` callback's `Effect.runSync` doesn't nest inside the surrounding
 * Effect — the ref is a plain mutable cell, safe to set from the callback.
 */
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
 */
export const bundle = (
  entryPoint: string,
): Effect.Effect<Bundled, BundlerError, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

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
              bundleWorkspacePlugin(path, skipPatterns),
              captureBuildResultPlugin(buildResultRef),
            ],
            logLevel: "silent",
          },
        }),
      catch: (cause) => new BundlerError({ cause }),
    }).pipe(
      // Surface any warnings bundleWorkspacePlugin emitted (e.g. a workspace
      // dependency it couldn't resolve and had to leave external) whether or
      // not the build/import succeeds — `bundle-require` `import()`s the result,
      // so the import can fail *because* of the dependency we warned about.
      // `captureBuildResultPlugin`'s `onEnd` runs during the esbuild build
      // (before that import), so `buildResultRef` is populated by the time this
      // finalizer reads it.
      Effect.ensuring(
        Effect.flatMap(Ref.get(buildResultRef), (captured) =>
          logCoalescedBuildWarnings(captured.warnings),
        ),
      ),
    );

    const { metafile } = yield* Ref.get(buildResultRef);
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
