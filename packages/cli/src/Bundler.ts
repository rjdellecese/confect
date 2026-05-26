import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
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

const packageNameFromSpecifier = (specifier: string) => {
  if (specifier.startsWith("@")) {
    const scopeEnd = specifier.indexOf("/", 1);
    if (scopeEnd === -1) {
      return specifier;
    }
    const subpathStart = specifier.indexOf("/", scopeEnd + 1);
    return subpathStart === -1 ? specifier : specifier.slice(0, subpathStart);
  }
  const slash = specifier.indexOf("/");
  return slash === -1 ? specifier : specifier.slice(0, slash);
};

const exportSubpathFromSpecifier = (specifier: string) => {
  const packageName = packageNameFromSpecifier(specifier);
  if (specifier === packageName) {
    return ".";
  }
  return `.${specifier.slice(packageName.length)}`;
};

const readExportTarget = (
  entry: unknown,
  condition: "import" | "require",
): string | undefined => {
  if (typeof entry === "string") {
    return entry;
  }
  if (!entry || typeof entry !== "object") {
    return undefined;
  }
  const conditions = entry as Record<string, unknown>;
  const primary = conditions[condition];
  if (typeof primary === "string") {
    return primary;
  }
  if (primary && typeof primary === "object") {
    const nested = primary as Record<string, unknown>;
    const nestedTarget = nested[condition];
    if (typeof nestedTarget === "string") {
      return nestedTarget;
    }
  }
  return undefined;
};

/**
 * Resolve a bare specifier to an absolute file URL suitable for `import()` from
 * a bundled ESM data URL. Prefer each package's ESM `import` export condition
 * so dual-package CJS/ESM deps like `convex/server` keep their named exports.
 * Fall back to CommonJS resolution for packages without an ESM entry (e.g.
 * `luxon`).
 */
const resolveBareSpecifierToFileUrl = (
  specifier: string,
  resolveDir: string,
) => {
  const parentFile = pathToFileURL(`${resolveDir}/_`).href;
  const require_ = createRequire(parentFile);
  const packageName = packageNameFromSpecifier(specifier);
  const subpath = exportSubpathFromSpecifier(specifier);
  const pkgJsonPath = require_.resolve(`${packageName}/package.json`);
  const pkgDir = dirname(pkgJsonPath);
  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as {
    exports?: Record<string, unknown>;
    module?: string;
  };

  const exportsEntry = pkg.exports?.[subpath];
  const importTarget =
    readExportTarget(exportsEntry, "import") ??
    (subpath === "." ? pkg.module : undefined);
  const resolvedPath = importTarget
    ? join(pkgDir, importTarget)
    : require_.resolve(specifier);

  return pathToFileURL(resolvedPath).href;
};

export const absoluteExternalsPlugin: esbuild.Plugin = {
  name: "absolute-externals",
  setup(build) {
    build.onResolve({ filter: /.*/ }, async (args) => {
      if (args.kind !== "import-statement" && args.kind !== "dynamic-import")
        return;
      if (isRelativeOrAbsolutePath(args.path)) return;
      if (args.path.startsWith("node:")) {
        return { path: args.path, external: true };
      }
      return {
        path: resolveBareSpecifierToFileUrl(args.path, args.resolveDir),
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
