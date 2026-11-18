import * as Record from "effect/Record";
import { GroupSpec, MiddlewareAttachment } from "@confect/core";
import { Registry, type RegistryItems } from "@confect/server";
import * as GroupImpl from "@confect/server/GroupImpl";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { Context } from "effect";
import * as Array from "effect/Array";
import * as Brand from "effect/Brand";
import * as Effect from "effect/Effect";
import * as HashSet from "effect/HashSet";
import * as Iterable from "effect/Iterable";
import { pipe } from "effect/Function";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as String from "effect/String";
import { fromBundlerError } from "./BuildError";
import * as Bundler from "./Bundler";
import {
  MissingImplFileError,
  MissingSpecFileError,
  ImplMissingDefaultLayerError,
  ImplMissingFunctionsError,
  ImplMissingMiddlewareError,
  ImplMissingSpecImportError,
  ImplNotFinalizedError,
  InvalidMiddlewareAttachmentError,
  InvalidContextReuseError,
  InvalidConvexModuleError,
  SpecImportsServerError,
  SpecMissingDefaultGroupSpecError,
} from "./CodegenError";
import { ConfectDirectory } from "./ConfectDirectory";
import { ImplModulePath } from "./ImplModulePath";
import { logWarn } from "./log";
import { removePathExtension, toPosixPath } from "./utils";

export interface LeafModule {
  readonly relativePath: string;
  readonly pathSegments: readonly [string, ...string[]];
  readonly groupPathDot: string;
  readonly exportName: string;
  readonly specImportPath: string;
}

export type LoadedLeafModule = LeafModule & {
  readonly spec: GroupSpec.AnyWithProps;
} & Brand.Brand<"@confect/cli/LoadedLeafModule">;

const LoadedLeafModule = Brand.nominal<LoadedLeafModule>();

const VALIDATION_CONCURRENCY = 4;

export const SPEC_SUFFIX = ".spec.ts";
export const IMPL_SUFFIX = ".impl.ts";
export const NATIVE_SUFFIX = ".native.ts";

const swapModuleSuffix = Effect.fnUntraced(function* (
  relativePath: string,
  fromSuffix: string,
  toSuffix: string,
) {
  const path = yield* Path.Path;
  const { dir, name, ext } = path.parse(relativePath);
  if (
    ext !== ".ts" ||
    !String.endsWith(String.slice(0, -".ts".length)(fromSuffix))(name)
  ) {
    return relativePath;
  }

  const stem = String.slice(
    0,
    -String.slice(0, -".ts".length)(fromSuffix).length,
  )(name);
  const nextName = `${stem}${String.slice(0, -".ts".length)(toSuffix)}`;
  return dir.length > 0
    ? path.join(dir, `${nextName}${ext}`)
    : `${nextName}${ext}`;
});

export const isLeafSpecPath = (relativePath: string) =>
  String.endsWith(SPEC_SUFFIX)(relativePath);

/**
 * @internal
 */
export const exportNameFromModulePath = Effect.fnUntraced(function* (
  relativePath: string,
) {
  const path = yield* Path.Path;
  const { name, ext } = path.parse(relativePath);
  if (ext !== ".ts") {
    return name;
  }
  return String.endsWith(".spec")(name)
    ? String.slice(0, -".spec".length)(name)
    : name;
});

/**
 * @internal
 */
export const groupPathFromRelativeModulePath = Effect.fnUntraced(function* (
  relativePath: string,
) {
  const path = yield* Path.Path;
  const { dir, name, ext } = path.parse(relativePath);
  const stem =
    ext === ".ts" && String.endsWith(".spec")(name)
      ? String.slice(0, -".spec".length)(name)
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

/**
 * @internal
 */
export const specImportPathFromGenerated = Effect.fnUntraced(function* (
  specRelativePath: string,
) {
  const path = yield* Path.Path;
  const pathWithoutExtension = yield* removePathExtension(specRelativePath);
  const withoutExt = toPosixPath(path, pathWithoutExtension);
  return `../${withoutExt}`;
});

/**
 * @internal
 */
export const specPathForImpl = (implRelativePath: string) =>
  swapModuleSuffix(
    implRelativePath,
    String.endsWith(NATIVE_SUFFIX)(implRelativePath)
      ? NATIVE_SUFFIX
      : IMPL_SUFFIX,
    SPEC_SUFFIX,
  );

/**
 * @internal
 */
export const implPathForSpec = (
  specRelativePath: string,
  convexModule = false,
) =>
  swapModuleSuffix(
    specRelativePath,
    SPEC_SUFFIX,
    convexModule ? NATIVE_SUFFIX : IMPL_SUFFIX,
  );

export const registeredFunctionsRelativePath = Effect.fnUntraced(function* (
  leaf: LeafModule,
) {
  const path = yield* Path.Path;
  return path.join("registeredFunctions", ...leaf.pathSegments) + ".ts";
});

/**
 * @internal
 */
export const discoverLeafSpecFiles = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

  const excludedDirs = HashSet.make("_generated", "tables", "middleware");
  const excludedFiles = HashSet.make("nodeSpec.ts", "spec.ts");

  const allPaths = yield* fs.readDirectory(confectDirectory, {
    recursive: true,
  });

  return Array.filter(allPaths, (relativePath) => {
    if (!isLeafSpecPath(relativePath)) {
      return false;
    }

    if (HashSet.has(excludedFiles, relativePath)) {
      return false;
    }

    const segments = String.split(relativePath, path.sep);
    return !Array.some(segments, (segment) =>
      HashSet.has(excludedDirs, segment),
    );
  });
});

/**
 * @internal
 */
export const discoverLeafImplFiles = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

  const excludedDirs = HashSet.make("_generated", "tables", "middleware");

  const allPaths = yield* fs.readDirectory(confectDirectory, {
    recursive: true,
  });

  const paths = HashSet.fromIterable(allPaths);
  return Array.filter(
    Array.filterMap(allPaths, (relativePath) =>
      Schema.decodeResult(ImplModulePath)(relativePath),
    ),
    (relativePath) => {
      if (String.endsWith(NATIVE_SUFFIX)(relativePath)) {
        const stem = String.slice(0, -NATIVE_SUFFIX.length)(relativePath);
        if (
          !HashSet.has(paths, stem + SPEC_SUFFIX) ||
          HashSet.has(paths, stem + IMPL_SUFFIX)
        )
          return false;
      }
      const segments = String.split(relativePath, path.sep);
      return !Array.some(segments, (segment) =>
        HashSet.has(excludedDirs, segment),
      );
    },
  );
});

/**
 * @internal
 */
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
 * imports through `_generated/refs.ts`—so a spec's whole import graph is
 * bundled into the browser whether or not the client calls those functions.
 * Server logic co-located with a declaration therefore ships to users,
 * silently.
 *
 * `@confect/server` is a sound proxy for "server logic lives here": an
 * implementation can't be written without `FunctionImpl`/`MiddlewareImpl`, both
 * of which live there. Table `Doc`/`Fields` schemas live in `@confect/core`, so
 * the documented `notes.Doc` pattern in a spec must not reach `@confect/server`
 * even through `tables/` or `_generated/`. The check runs over the spec
 * bundle's transitive inputs rather than the spec module alone, so it also
 * covers middleware declarations under `confect/middleware/` (which codegen
 * otherwise never visits) and any shared helper a spec pulls in—while only ever
 * flagging modules that genuinely reach the client.
 */
const validateClientSafety = Effect.fnUntraced(function* (
  leaf: LeafModule,
  bundled: Bundler.Bundled,
) {
  const path = yield* Path.Path;
  const directory = yield* ConfectDirectory.get;
  const confectDirectory = path.resolve(directory);

  const isCheckedUserModule = (absolutePath: string) => {
    const relative = path.relative(confectDirectory, absolutePath);
    return !String.startsWith("..")(relative) && !path.isAbsolute(relative);
  };

  const importers = Bundler.importersOfPackage(
    bundled,
    "@confect/server",
    isCheckedUserModule,
  );

  if (importers.length > 0) {
    return yield* SpecImportsServerError.make({
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
 * {@link validateClientSafety}). Returns the leaf paired with its validated
 * spec, so subsequent operations reuse that association without re-bundling.
 * The runtime is declared by the spec, not its file location.
 *
 * @internal
 */
export const loadSpec = Effect.fn("LeafModule.loadSpec")(function* (
  leaf: LeafModule,
) {
  const absolutePath = yield* absoluteModulePath(leaf.relativePath);
  const bundled = yield* Bundler.bundle(absolutePath).pipe(
    Effect.mapError((error) => fromBundlerError(leaf.relativePath, error)),
  );

  const groupSpec = bundled.module.default;

  if (!GroupSpec.isGroupSpec(groupSpec)) {
    return yield* SpecMissingDefaultGroupSpecError.make({
      specPath: leaf.relativePath,
    });
  }

  yield* validateClientSafety(leaf, bundled);

  const warnings = yield* Effect.fromResult(
    validateGroupOptions(groupSpec, leaf.relativePath, leaf.groupPathDot, true),
  );
  for (const groupPath of warnings) {
    yield* logWarn(
      `${leaf.relativePath}, group ${groupPath}: experimental_reuseContext has no effect on actions; this group contains only actions.`,
    );
  }

  yield* Effect.fromResult(GroupSpec.validateMiddleware(groupSpec)).pipe(
    Effect.mapError((error) =>
      InvalidMiddlewareAttachmentError.make({
        specPath: leaf.relativePath,
        message: MiddlewareAttachment.formatValidationError(error),
      }),
    ),
  );

  return LoadedLeafModule({
    ...leaf,
    spec: groupSpec,
  });
});

const validateGroupOptions = (
  group: GroupSpec.AnyWithProps,
  specPath: string,
  groupPath: string,
  leafRoot: boolean,
): Result.Result<
  ReadonlyArray<string>,
  InvalidContextReuseError | InvalidConvexModuleError
> =>
  Result.gen(function* () {
    const invalidModule = (reason: string) =>
      Result.fail(
        InvalidConvexModuleError.make({
          path: specPath,
          reason: `Group ${groupPath}: ${reason}`,
        }),
      );
    if (
      group.convexModule !== undefined &&
      typeof group.convexModule !== "boolean"
    )
      return yield* invalidModule("convexModule must be a boolean.");
    if (group.convexModule) {
      if (!leafRoot || !Record.isEmptyRecord(group.groups))
        return yield* invalidModule(
          "convexModule applies to a single file group; put subgroups in their own .spec.ts files.",
        );
      if (group.middlewareAttachments.length !== 0)
        return yield* invalidModule(
          "convexModule cannot run Confect middleware.",
        );
      for (const fn of Record.values(group.functions)) {
        if (fn.runtimeAndFunctionType.runtime !== group.runtime)
          return yield* invalidModule(
            `"${fn.name}" declares the ${fn.runtimeAndFunctionType.runtime} runtime, but the group's runtime is ${group.runtime}.`,
          );
        if (
          fn.functionProvenance._tag !== "Convex" ||
          fn.middlewareAttachments.length !== 0
        )
          return yield* invalidModule(
            `convexModule requires FunctionSpec.convex* declarations without middleware; check "${fn.name}".`,
          );
      }
    }
    const isEnabled = group.experimental_reuseContext;
    if (isEnabled !== undefined && typeof isEnabled !== "boolean") {
      return yield* Result.fail(
        InvalidContextReuseError.make({
          specPath,
          groupPath,
          reason: "InvalidOption",
        }),
      );
    }
    if (isEnabled) {
      if (group.runtime === "Node") {
        return yield* Result.fail(
          InvalidContextReuseError.make({
            specPath,
            groupPath,
            reason: "NodeRuntime",
          }),
        );
      }
      if (Record.has(group.functions, "experimental_reuseContext")) {
        return yield* Result.fail(
          InvalidContextReuseError.make({
            specPath,
            groupPath,
            reason: "ReservedFunctionName",
          }),
        );
      }
    }
    const functions = Record.values(group.functions);
    const warnings =
      isEnabled &&
      functions.length > 0 &&
      Array.every(
        functions,
        (fn) => fn.runtimeAndFunctionType.functionType === "action",
      )
        ? [groupPath]
        : [];
    const childWarnings = yield* pipe(
      group.groups,
      Record.toEntries,
      Iterable.map(([name, child]) =>
        validateGroupOptions(child, specPath, `${groupPath}.${name}`, false),
      ),
      Result.all,
    );
    return [...warnings, ...Array.flatten(childWarnings)];
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
 * Build the impl layer with a fresh `Registry` so each validation is isolated
 * from prior validations' `FunctionImpl.make` writes. The CLI no longer reads
 * the registry directly—`GroupImpl.finalize` snapshots the registered function
 * names onto the produced `Finalized` `GroupImpl` service value—but a fresh
 * `Ref` is still required because the default `Context.Reference` is cached
 * globally and would otherwise accumulate items across impls.
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
 *
 * @internal
 */
export const validateImpl = Effect.fn("LeafModule.validateImpl")(function* (
  leaf: LoadedLeafModule,
) {
  const implRelativePath = yield* implPathForSpec(
    leaf.relativePath,
    leaf.spec.convexModule,
  );
  const implAbsolutePath = yield* absoluteModulePath(implRelativePath);
  const specAbsolutePath = yield* absoluteModulePath(leaf.relativePath);

  const bundled = yield* Bundler.bundle(implAbsolutePath).pipe(
    Effect.mapError((error) => fromBundlerError(implRelativePath, error)),
  );

  if (leaf.spec.convexModule) {
    for (const fn of Record.values(leaf.spec.functions)) {
      const handler = bundled.module[fn.name];
      const kind = fn.runtimeAndFunctionType.functionType;
      const kindMarker = {
        query: "isQuery",
        mutation: "isMutation",
        action: "isAction",
      }[kind];
      const visibilityMarker =
        fn.functionVisibility === "public" ? "isPublic" : "isInternal";
      if (
        typeof handler !== "function" ||
        handler[kindMarker] !== true ||
        handler[visibilityMarker] !== true
      ) {
        return yield* InvalidConvexModuleError.make({
          path: implRelativePath,
          reason: `Expected named export "${fn.name}" to be a registered ${fn.functionVisibility} Convex ${kind}.`,
        });
      }
    }
    return;
  }

  if (
    !(yield* Bundler.directlyImports(
      bundled,
      implAbsolutePath,
      specAbsolutePath,
    ))
  ) {
    return yield* ImplMissingSpecImportError.make({
      implPath: implRelativePath,
      expectedSpecPath: leaf.relativePath,
    });
  }

  if (!Layer.isLayer(bundled.module.default)) {
    return yield* ImplMissingDefaultLayerError.make({
      implPath: implRelativePath,
    });
  }

  const groupSpec = leaf.spec;
  const expectedFunctionNames = Record.keys(groupSpec.functions);

  const context = yield* buildImplLayer(
    bundled.module.default as Layer.Layer<unknown>,
  );
  const finalizedGroupImpl = yield* Option.match(
    findFinalizedGroupImpl(context),
    {
      onNone: () => ImplNotFinalizedError.make({ implPath: implRelativePath }),
      onSome: Effect.succeed,
    },
  );

  const registeredSet = HashSet.fromIterable(
    finalizedGroupImpl.registeredFunctionNames,
  );
  const missing = Array.filter(
    expectedFunctionNames,
    (name) => !HashSet.has(registeredSet, name),
  );

  if (missing.length > 0) {
    return yield* ImplMissingFunctionsError.make({
      implPath: implRelativePath,
      groupPath: leaf.groupPathDot,
      missingFunctionNames: missing,
    });
  }

  const expectedMiddlewareKeys = Array.dedupe([
    ...Array.map(
      groupSpec.middlewareSpecs ?? [],
      (middlewareSpec) => middlewareSpec.key,
    ),
    ...Array.flatMap(Record.values(groupSpec.functions), (function_) =>
      Array.map(
        function_.middlewareSpecs ?? [],
        (middlewareSpec) => middlewareSpec.key,
      ),
    ),
  ]);
  const registeredMiddlewareKeys = HashSet.fromIterable(
    finalizedGroupImpl.registeredMiddlewareKeys ?? [],
  );
  const missingMiddleware = Array.filter(
    expectedMiddlewareKeys,
    (key) => !HashSet.has(registeredMiddlewareKeys, key),
  );

  if (missingMiddleware.length > 0) {
    return yield* ImplMissingMiddlewareError.make({
      implPath: implRelativePath,
      groupPath: leaf.groupPathDot,
      missingMiddlewareKeys: missingMiddleware,
    });
  }
});

/**
 * @internal
 */
export const withImplFiles = Effect.fnUntraced(function* <A, E, R>(
  relativePaths: ReadonlyArray<ImplModulePath>,
  use: (leaves: ReadonlyArray<LoadedLeafModule>) => Effect.Effect<A, E, R>,
  requiredPaths: ReadonlyArray<ImplModulePath> = relativePaths,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const pairs = yield* Effect.forEach(
    relativePaths,
    Effect.fnUntraced(function* (implRelativePath) {
      const specRelativePath = yield* specPathForImpl(implRelativePath);
      if (!(yield* fs.exists(path.join(confectDirectory, specRelativePath))))
        return yield* MissingSpecFileError.make({
          implPath: implRelativePath,
          expectedSpecPath: specRelativePath,
        });
      if (yield* fs.exists(path.join(confectDirectory, implRelativePath)))
        return { implRelativePath, specRelativePath };
      if (requiredPaths.includes(implRelativePath)) {
        if (String.endsWith(NATIVE_SUFFIX)(implRelativePath))
          return yield* InvalidConvexModuleError.make({
            path: specRelativePath,
            reason: `Missing native module ${implRelativePath}.`,
          });
        return yield* MissingImplFileError.make({
          specPath: specRelativePath,
          expectedImplPath: implRelativePath,
        });
      }
      return {
        implRelativePath: yield* implPathForSpec(specRelativePath, true),
        specRelativePath,
      };
    }),
    { concurrency: 1 },
  );

  return yield* Bundler.withBatch(
    Array.dedupe(
      Array.flatMap(pairs, ({ implRelativePath, specRelativePath }) => [
        path.resolve(confectDirectory, implRelativePath),
        path.resolve(confectDirectory, specRelativePath),
      ]),
    ),
    Effect.gen(function* () {
      const leaves = yield* Effect.forEach(
        Array.dedupe(
          Array.map(pairs, ({ specRelativePath }) => specRelativePath),
        ),
        loadWithSibling,
        { concurrency: VALIDATION_CONCURRENCY },
      );
      return yield* use(leaves);
    }),
  );
});

export const validateImplFiles = Effect.fn("LeafModule.validateImplFiles")(
  (relativePaths: ReadonlyArray<ImplModulePath>) =>
    withImplFiles(relativePaths, validateAllImpls),
);

/**
 * @internal
 */
export const validateAllImpls = Effect.fnUntraced(function* (
  leaves: ReadonlyArray<LoadedLeafModule>,
) {
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const implementationPaths = yield* Effect.forEach(
    leaves,
    ({ relativePath, spec }) =>
      implPathForSpec(relativePath, spec.convexModule).pipe(
        Effect.map((implPath) => path.resolve(confectDirectory, implPath)),
      ),
    { concurrency: 1 },
  );
  yield* Bundler.withBatch(
    implementationPaths,
    Effect.forEach(leaves, validateImpl, {
      concurrency: VALIDATION_CONCURRENCY,
      discard: true,
    }),
  );
});

/**
 * @internal
 */
const loadWithSibling = Effect.fnUntraced(function* (specRelativePath: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const discovered = yield* toLeafModule(specRelativePath);
  const leaf = yield* loadSpec(discovered);
  const regular = yield* implPathForSpec(specRelativePath);
  const hasImpl = yield* fs.exists(path.join(confectDirectory, regular));
  if (leaf.spec.convexModule) {
    const native = yield* implPathForSpec(specRelativePath, true);
    if (hasImpl || !(yield* fs.exists(path.join(confectDirectory, native))))
      return yield* InvalidConvexModuleError.make({
        path: specRelativePath,
        reason: hasImpl
          ? `convexModule uses ${native}; remove the conflicting ${regular}.`
          : `Missing native module ${native}.`,
      });
  } else if (!hasImpl) {
    return yield* MissingImplFileError.make({
      specPath: specRelativePath,
      expectedImplPath: regular,
    });
  }
  return leaf;
});

export const loadAll = Effect.gen(function* () {
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const specFiles = yield* discoverLeafSpecFiles;

  const results = yield* Bundler.withBatch(
    Array.map(specFiles, (relativePath) =>
      path.resolve(confectDirectory, relativePath),
    ),
    Effect.forEach(specFiles, loadWithSibling, {
      concurrency: VALIDATION_CONCURRENCY,
    }),
  );

  yield* validateOrphanImpls(specFiles);

  return results;
});

/**
 * Walk leaf ancestors and fail with a {@link ParentChildNameCollisionError} when
 * a parent leaf declares a function or subgroup whose name matches a sibling
 * subdirectory spec's segment. Without this check the colliding descendant
 * would overwrite the parent's entry in the assembled `GroupSpec.groups` map at
 * runtime, surfacing as a confusing `Refs.make` error rather than a
 * codegen-time diagnostic.
 */
const validateOrphanImpls = Effect.fnUntraced(function* (
  specFiles: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const implFiles = yield* discoverLeafImplFiles;
  const specPaths = HashSet.fromIterable(specFiles);

  yield* Effect.forEach(
    implFiles,
    Effect.fnUntraced(function* (implRelativePath: string) {
      const specRelativePath = yield* specPathForImpl(implRelativePath);
      if (HashSet.has(specPaths, specRelativePath)) {
        return;
      }

      const specAbsolutePath = path.join(confectDirectory, specRelativePath);
      if (!(yield* fs.exists(specAbsolutePath))) {
        return yield* MissingSpecFileError.make({
          implPath: implRelativePath,
          expectedSpecPath: specRelativePath,
        });
      }
    }),
    { concurrency: 1 },
  );
});
