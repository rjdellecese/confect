import { pathToFileURL } from "node:url";
import { Path } from "@effect/platform";
import { Array, Effect, Option, pipe } from "effect";
import * as esbuild from "esbuild";
import { BundlerError } from "./BuildError";

export interface Bundled {
  readonly module: any;
  readonly metafile: esbuild.Metafile;
}

const isRelativeOrAbsolutePath = (importPath: string) =>
  importPath.startsWith("./") ||
  importPath.startsWith("../") ||
  importPath.startsWith("/");

// Recursion guard for `absoluteExternalsPlugin`. When the plugin asks esbuild
// to resolve a bare specifier via `build.resolve(...)`, esbuild invokes every
// registered `onResolve` hook again for that same specifier — including this
// one. The flag (carried through the recursive call via `pluginData`) tells
// the recursive invocation to skip rewriting and fall through to esbuild's
// built-in resolver, which is what we wanted from `build.resolve` in the
// first place.
const PLUGIN_DATA_SKIP = Symbol("absolute-externals.skip");

/**
 * Mark every bare-specifier import as external and rewrite it to an absolute
 * `file://` URL. Resolution is delegated to esbuild's own resolver via
 * `build.resolve(...)`, which honors each package's `exports` map (preferring
 * the `import` condition under `format: "esm"`) and falls back to
 * `module`/`main` exactly the way Node's ESM resolution algorithm does.
 *
 * Bundles produced with this plugin are loaded via a data URL `import(...)`
 * (see {@link bundle}); rewriting bare externals to absolute file URLs is what
 * makes them resolvable at runtime, since a data URL has no parent file from
 * which a bare specifier could be resolved.
 *
 * Relative/absolute-path imports are left to esbuild to bundle as usual, and
 * `node:*` built-ins are passed through unchanged.
 */
export const absoluteExternalsPlugin: esbuild.Plugin = {
  name: "absolute-externals",
  setup(build) {
    build.onResolve({ filter: /.*/ }, async (args) => {
      if (args.pluginData?.[PLUGIN_DATA_SKIP]) return;
      if (args.kind !== "import-statement" && args.kind !== "dynamic-import")
        return;
      if (isRelativeOrAbsolutePath(args.path)) return;
      if (args.path.startsWith("node:")) {
        return { path: args.path, external: true };
      }

      const resolved = await build.resolve(args.path, {
        kind: args.kind,
        resolveDir: args.resolveDir,
        pluginData: { [PLUGIN_DATA_SKIP]: true },
      });

      if (resolved.errors.length > 0) {
        return { errors: resolved.errors, warnings: resolved.warnings };
      }

      return {
        path: pathToFileURL(resolved.path).href,
        external: true,
      };
    });
  },
};

const buildEntry = (entryPoint: string) =>
  Effect.tryPromise({
    try: () =>
      esbuild.build({
        entryPoints: [entryPoint],
        bundle: true,
        write: false,
        platform: "node",
        format: "esm",
        logLevel: "silent",
        metafile: true,
        plugins: [absoluteExternalsPlugin],
      }),
    catch: (cause) => new BundlerError({ cause }),
  });

const importBundledModule = (result: esbuild.BuildResult) => {
  const code = result.outputFiles![0]!.text;
  const dataUrl =
    "data:text/javascript;base64," + Buffer.from(code).toString("base64");
  return import(dataUrl);
};

/**
 * Bundle a TypeScript entry point with esbuild and import the result via a
 * data URL. This handles extensionless `.ts` imports regardless of whether
 * the user's project sets `"type": "module"` in package.json. The returned
 * pair carries both the imported module and the esbuild metafile so callers
 * can inspect the import graph (see {@link directlyImports}).
 */
export const bundle = (
  entryPoint: string,
): Effect.Effect<Bundled, BundlerError> =>
  Effect.gen(function* () {
    const result = yield* buildEntry(entryPoint);
    const module = yield* Effect.tryPromise({
      try: () => importBundledModule(result),
      catch: (cause) => new BundlerError({ cause }),
    });
    if (!result.metafile) {
      return yield* Effect.dieMessage("esbuild metafile missing");
    }
    return { module, metafile: result.metafile };
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
