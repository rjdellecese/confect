import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { Path } from "@effect/platform";
import { Array, Effect, Option, pipe } from "effect";
import * as esbuild from "esbuild";
import { BundlerError } from "./BuildError";

export interface Bundled {
  readonly module: any;
  readonly metafile: esbuild.Metafile;
}

export const EXTERNAL_PACKAGES = [
  "@confect/core",
  "@confect/server",
  "effect",
  "@effect/*",
];

const isExternalImport = (path: string) =>
  EXTERNAL_PACKAGES.some((p) => {
    if (p.endsWith("/*")) {
      return path.startsWith(p.slice(0, -1));
    }
    return path === p || path.startsWith(p + "/");
  });

export const absoluteExternalsPlugin: esbuild.Plugin = {
  name: "absolute-externals",
  setup(build) {
    build.onResolve({ filter: /.*/ }, async (args) => {
      if (args.kind !== "import-statement" && args.kind !== "dynamic-import")
        return;
      if (!isExternalImport(args.path)) return;
      // `import.meta.resolve`'s second argument is silently ignored in modern
      // Node, so resolution would always walk up from the CLI's bundled file
      // (`packages/cli/dist/utils.mjs`) instead of from the user's project.
      // Use `createRequire` keyed on the importing file's directory so we
      // resolve out of *their* `node_modules`. The synthetic filename is just
      // a CommonJS resolution anchor; the file does not need to exist.
      const parentFile = pathToFileURL(args.resolveDir + "/_").href;
      const require_ = createRequire(parentFile);
      const resolvedPath = require_.resolve(args.path);
      const resolved = pathToFileURL(resolvedPath).href;
      return { path: resolved, external: true };
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
