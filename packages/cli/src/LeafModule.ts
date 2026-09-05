import { GroupSpec } from "@confect/core";
import { Registry, type RegistryItems } from "@confect/server";
import * as GroupImpl from "@confect/server/GroupImpl";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { Context } from "effect";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as String from "effect/String";
import { fromBundlerError } from "./BuildError";
import * as Bundler from "./Bundler";
import {
  ImplMissingDefaultLayerError,
  ImplMissingFunctionsError,
  ImplMissingMiddlewareError,
  ImplMissingSpecImportError,
  ImplNotFinalizedError,
  SpecImportsServerError,
  SpecMissingDefaultGroupSpecError,
} from "./CodegenError";
import { ConfectDirectory } from "./ConfectDirectory";
import { removePathExtension, toPosixPath } from "./utils";

export interface LeafModule {
  readonly relativePath: string;
  readonly pathSegments: readonly [string, ...string[]];
  readonly groupPathDot: string;
  readonly exportName: string;
  /**
   * The runtime declared by the group's spec — `"Node"` for
   * `GroupSpec.makeNode()`, `"Convex"` for `GroupSpec.make()`. `None` while the
   * runtime is unknown: discovery (`toLeafModule`) works from the file path alone,
   * which does not determine the runtime, so this is filled in once the spec has
   * been bundled and validated (see `validateSpec`).
   */
  readonly runtime: Option.Option<"Convex" | "Node">;
  readonly specImportPath: string;
}

export const SPEC_SUFFIX = ".spec.ts";
export const IMPL_SUFFIX = ".impl.ts";

const swapModuleSuffix = Effect.fnUntraced(function* (
  relativePath: string,
  fromSuffix: string,
  toSuffix: string,
) {
  const path = yield* Path.Path;
  const { dir, name, ext } = path.parse(relativePath);
  if (ext !== ".ts" || !name.endsWith(fromSuffix.slice(0, -".ts".length))) {
    return relativePath;
  }

  const stem = name.slice(0, -fromSuffix.slice(0, -".ts".length).length);
  const nextName = `${stem}${toSuffix.slice(0, -".ts".length)}`;
  return dir.length > 0
    ? path.join(dir, `${nextName}${ext}`)
    : `${nextName}${ext}`;
});

export const isLeafSpecPath = (relativePath: string) =>
  relativePath.endsWith(SPEC_SUFFIX);

export const isLeafImplPath = (relativePath: string) =>
  relativePath.endsWith(IMPL_SUFFIX);

export const exportNameFromModulePath = Effect.fnUntraced(function* (
  relativePath: string,
) {
  const path = yield* Path.Path;
  const { name, ext } = path.parse(relativePath);
  if (ext !== ".ts") {
    return name;
  }
  return name.endsWith(".spec") ? name.slice(0, -".spec".length) : name;
});

export const groupPathFromRelativeModulePath = Effect.fnUntraced(function* (
  relativePath: string,
) {
  const path = yield* Path.Path;
  const { dir, name, ext } = path.parse(relativePath);
  const stem =
    ext === ".ts" && name.endsWith(".spec")
      ? name.slice(0, -".spec".length)
      : name;
  const dirSegments = Array.filter(
    String.split(dir, path.sep),
    String.isNonEmpty,
  );
  const pathSegments = Array.append(dirSegments, stem) as [string, ...string[]];
  return {
    pathSegments,
    groupPathDot: Array.join(pathSegments, "."),
  };
});

export const specImportPathFromGenerated = Effect.fnUntraced(function* (
  specRelativePath: string,
) {
  const path = yield* Path.Path;
  const withoutExt = toPosixPath(
    path,
    yield* removePathExtension(specRelativePath),
  );
  return `../${withoutExt}`;
});

export const specPathForImpl = (implRelativePath: string) =>
  swapModuleSuffix(implRelativePath, IMPL_SUFFIX, SPEC_SUFFIX);

export const implPathForSpec = (specRelativePath: string) =>
  swapModuleSuffix(specRelativePath, SPEC_SUFFIX, IMPL_SUFFIX);

export const registeredFunctionsRelativePath = Effect.fnUntraced(function* (
  leaf: LeafModule,
) {
  const path = yield* Path.Path;
  return path.join("registeredFunctions", ...leaf.pathSegments) + ".ts";
});

export const discoverLeafSpecFiles = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

  const excludedDirs = new Set(["_generated", "tables", "middleware"]);
  const excludedFiles = new Set(["nodeSpec.ts", "spec.ts"]);

  const allPaths = yield* fs.readDirectory(confectDirectory, {
    recursive: true,
  });

  return Array.filter(allPaths, (relativePath) => {
    if (!isLeafSpecPath(relativePath)) {
      return false;
    }

    if (excludedFiles.has(relativePath)) {
      return false;
    }

    const segments = String.split(relativePath, path.sep);
    return !Array.some(segments, (segment) => excludedDirs.has(segment));
  });
});

export const discoverLeafImplFiles = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

  const excludedDirs = new Set(["_generated", "tables", "middleware"]);

  const allPaths = yield* fs.readDirectory(confectDirectory, {
    recursive: true,
  });

  return Array.filter(allPaths, (relativePath) => {
    if (!isLeafImplPath(relativePath)) {
      return false;
    }

    const segments = String.split(relativePath, path.sep);
    return !Array.some(segments, (segment) => excludedDirs.has(segment));
  });
});

export const toLeafModule = Effect.fnUntraced(function* (
  specRelativePath: string,
) {
  const exportName = yield* exportNameFromModulePath(specRelativePath);
  const { pathSegments, groupPathDot } =
    yield* groupPathFromRelativeModulePath(specRelativePath);
  const specImportPath = yield* specImportPathFromGenerated(specRelativePath);

  return {
    relativePath: specRelativePath,
    pathSegments,
    groupPathDot,
    exportName,
    // Unknown until the spec is bundled; see `LeafModule.runtime`.
    runtime: Option.none(),
    specImportPath,
  } satisfies LeafModule;
});

const absoluteModulePath = Effect.fnUntraced(function* (relativePath: string) {
  const confectDirectory = yield* ConfectDirectory.get;
  const path = yield* Path.Path;
  return path.resolve(confectDirectory, relativePath);
});

/**
 * Every `*.spec.ts` is reachable from `_generated/spec.ts`, which the client
 * imports through `_generated/refs.ts` — so a spec's whole import graph is
 * bundled into the browser whether or not the client calls those functions.
 * Server logic co-located with a declaration therefore ships to users, silently.
 *
 * `@confect/server` is a sound proxy for "server logic lives here": an
 * implementation can't be written without `FunctionImpl` / `MiddlewareImpl`,
 * both of which live there. Table `Doc` / `Fields` schemas live in
 * `@confect/core`, so the documented `notes.Doc` pattern in a spec must not
 * reach `@confect/server` even through `tables/` or `_generated/`. The check
 * runs over the spec bundle's transitive inputs rather than the spec module
 * alone, so it also covers middleware declarations under
 * `confect/middleware/` (which codegen otherwise never visits) and any
 * shared helper a spec pulls in — while only ever flagging modules that
 * genuinely reach the client.
 */
const validateClientSafety = Effect.fnUntraced(function* (
  leaf: LeafModule,
  bundled: Bundler.Bundled,
) {
  const path = yield* Path.Path;
  const confectDirectory = path.resolve(yield* ConfectDirectory.get);

  const isCheckedUserModule = (absolutePath: string) => {
    const relative = path.relative(confectDirectory, absolutePath);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  };

  const importers = Bundler.importersOfPackage(
    bundled,
    "@confect/server",
    isCheckedUserModule,
  );

  if (importers.length > 0) {
    return yield* new SpecImportsServerError({
      specPath: leaf.relativePath,
      importerPaths: Array.map(importers, (absolutePath) =>
        toPosixPath(path, path.relative(confectDirectory, absolutePath)),
      ),
    });
  }
});

/**
 * Validate that the leaf's spec file default-exports a `GroupSpec`, and that
 * nothing it reaches drags server code into the client (see
 * {@link validateClientSafety}). Returns the validated `GroupSpec` so callers
 * can read its runtime and avoid re-bundling for later inspection (e.g.
 * stamping `leaf.runtime` and parent/child name-collision checks at codegen
 * time). The group's runtime (`Convex` vs `Node`) is whatever the spec
 * declares — it is not constrained by the file's location.
 */
export const validateSpec = Effect.fn("LeafModule.validateSpec")(function* (
  leaf: LeafModule,
) {
  const absolutePath = yield* absoluteModulePath(leaf.relativePath);
  const bundled = yield* Bundler.bundle(absolutePath).pipe(
    Effect.mapError((error) => fromBundlerError(leaf.relativePath, error)),
  );

  const groupSpec = bundled.module.default;

  if (!GroupSpec.isGroupSpec(groupSpec)) {
    return yield* new SpecMissingDefaultGroupSpecError({
      specPath: leaf.relativePath,
    });
  }

  yield* validateClientSafety(leaf, bundled);

  return groupSpec;
});

/**
 * Walk the built `Context` for a `Finalized` `GroupImpl` service value. The
 * lookup is value-shaped (via `GroupImpl.isFinalizedGroupImpl`) so we don't
 * need to know the group's path up front to construct a typed tag for it.
 */
const findFinalizedGroupImpl = <S>(
  context: Context.Context<S>,
): Option.Option<GroupImpl.AnyFinalized> =>
  Array.findFirst(context.mapUnsafe.values(), GroupImpl.isFinalizedGroupImpl);

/**
 * Build the impl layer with a fresh `Registry` so each validation is
 * isolated from prior validations' `FunctionImpl.make` writes. The CLI no
 * longer reads the registry directly — `GroupImpl.finalize` snapshots the
 * registered function names onto the produced `Finalized` `GroupImpl`
 * service value — but a fresh `Ref` is still required because the default
 * `Context.Reference` is cached globally and would otherwise accumulate
 * items across impls.
 */
const buildImplLayer = Effect.fnUntraced(function* (
  implLayer: Layer.Layer<unknown>,
) {
  const registry = Ref.makeUnsafe<RegistryItems.RegistryItems>({});
  return yield* Layer.build(
    implLayer as Layer.Layer<unknown, never, never>,
  ).pipe(Effect.provideService(Registry.Registry, registry));
}, Effect.scoped);

/**
 * Validate that the leaf's sibling impl file imports the spec, default-exports
 * a finalized `GroupImpl` layer, and provides a `FunctionImpl` for every
 * function declared by the spec.
 */
export const validateImpl = Effect.fn("LeafModule.validateImpl")(function* (
  leaf: LeafModule,
) {
  const implRelativePath = yield* implPathForSpec(leaf.relativePath);
  const implAbsolutePath = yield* absoluteModulePath(implRelativePath);
  const specAbsolutePath = yield* absoluteModulePath(leaf.relativePath);

  const bundled = yield* Bundler.bundle(implAbsolutePath).pipe(
    Effect.mapError((error) => fromBundlerError(implRelativePath, error)),
  );

  if (
    !(yield* Bundler.directlyImports(
      bundled,
      implAbsolutePath,
      specAbsolutePath,
    ))
  ) {
    return yield* new ImplMissingSpecImportError({
      implPath: implRelativePath,
      expectedSpecPath: leaf.relativePath,
    });
  }

  if (!Layer.isLayer(bundled.module.default)) {
    return yield* new ImplMissingDefaultLayerError({
      implPath: implRelativePath,
    });
  }

  const { module: specModule } = yield* Bundler.bundle(specAbsolutePath).pipe(
    Effect.mapError((error) => fromBundlerError(leaf.relativePath, error)),
  );
  const groupSpec = specModule.default as GroupSpec.AnyWithProps;
  const expectedFunctionNames = Object.keys(groupSpec.functions);

  const context = yield* buildImplLayer(
    bundled.module.default as Layer.Layer<unknown>,
  );
  const finalizedGroupImpl = yield* Option.match(
    findFinalizedGroupImpl(context),
    {
      onNone: () => new ImplNotFinalizedError({ implPath: implRelativePath }),
      onSome: Effect.succeed,
    },
  );

  const registeredSet = new Set(finalizedGroupImpl.registeredFunctionNames);
  const missing = expectedFunctionNames.filter(
    (name) => !registeredSet.has(name),
  );

  if (missing.length > 0) {
    return yield* new ImplMissingFunctionsError({
      implPath: implRelativePath,
      groupPath: leaf.groupPathDot,
      missingFunctionNames: missing,
    });
  }

  const expectedMiddlewareKeys = [
    ...new Set([
      ...(groupSpec.middlewareSpecs ?? []).map(
        (middlewareSpec) => middlewareSpec.key,
      ),
      ...Object.values(groupSpec.functions).flatMap((function_) =>
        (function_.middlewareSpecs ?? []).map(
          (middlewareSpec) => middlewareSpec.key,
        ),
      ),
    ]),
  ];
  const registeredMiddlewareKeys = new Set(
    finalizedGroupImpl.registeredMiddlewareKeys ?? [],
  );
  const missingMiddleware = expectedMiddlewareKeys.filter(
    (key) => !registeredMiddlewareKeys.has(key),
  );

  if (missingMiddleware.length > 0) {
    return yield* new ImplMissingMiddlewareError({
      implPath: implRelativePath,
      groupPath: leaf.groupPathDot,
      missingMiddlewareKeys: missingMiddleware,
    });
  }
});
