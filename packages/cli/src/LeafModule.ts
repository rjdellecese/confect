import { GroupSpec, Registry } from "@confect/core";
import * as GroupImpl from "@confect/server/GroupImpl";
import { FileSystem, Path } from "@effect/platform";
import type { Context } from "effect";
import { Array, Effect, Layer, Option, Ref, String } from "effect";
import { fromBundlerError } from "./BuildError";
import * as Bundler from "./Bundler";
import {
  ImplMissingDefaultLayerError,
  ImplMissingFunctionsError,
  ImplMissingSpecImportError,
  ImplNotFinalizedError,
  SpecMissingDefaultGroupSpecError,
  SpecRuntimeMismatchError,
} from "./CodegenError";
import { ConfectDirectory } from "./ConfectDirectory";
import { removePathExtension } from "./utils";

export interface LeafModule {
  readonly relativePath: string;
  readonly pathSegments: readonly [string, ...string[]];
  readonly groupPathDot: string;
  readonly registryGroupPathDot: string;
  readonly exportName: string;
  readonly runtime: "Convex" | "Node";
  readonly specImportPath: string;
}

export const SPEC_SUFFIX = ".spec.ts";
export const IMPL_SUFFIX = ".impl.ts";

const swapModuleSuffix = (
  relativePath: string,
  fromSuffix: string,
  toSuffix: string,
) =>
  Effect.gen(function* () {
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

export const exportNameFromModulePath = (relativePath: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const { name, ext } = path.parse(relativePath);
    if (ext !== ".ts") {
      return name;
    }
    return name.endsWith(".spec") ? name.slice(0, -".spec".length) : name;
  });

export const groupPathFromRelativeModulePath = (relativePath: string) =>
  Effect.gen(function* () {
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
    const pathSegments = Array.append(dirSegments, stem) as [
      string,
      ...string[],
    ];
    return {
      pathSegments,
      groupPathDot: Array.join(pathSegments, "."),
    };
  });

export const specImportPathFromGenerated = (specRelativePath: string) =>
  Effect.gen(function* () {
    const withoutExt = yield* removePathExtension(specRelativePath);
    return `../${withoutExt}`;
  });

export const specPathForImpl = (implRelativePath: string) =>
  swapModuleSuffix(implRelativePath, IMPL_SUFFIX, SPEC_SUFFIX);

export const implPathForSpec = (specRelativePath: string) =>
  swapModuleSuffix(specRelativePath, SPEC_SUFFIX, IMPL_SUFFIX);

export const isNodeLeafModule = (relativePath: string) =>
  relativePath.startsWith("node/") || relativePath.startsWith("node\\");

export const toNodeRegistryLeaf = (leaf: LeafModule): LeafModule => ({
  ...leaf,
  pathSegments: [leaf.exportName],
  groupPathDot: leaf.exportName,
});

export const registeredFunctionsRelativePath = (leaf: LeafModule) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return (
      path.join(
        "registeredFunctions",
        ...leaf.pathSegments.slice(leaf.runtime === "Node" ? 1 : 0),
      ) + ".ts"
    );
  });

export const discoverLeafSpecFiles = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

  const excludedDirs = new Set(["_generated", "tables"]);
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

  const excludedDirs = new Set(["_generated", "tables"]);

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

export const toLeafModule = (specRelativePath: string) =>
  Effect.gen(function* () {
    const exportName = yield* exportNameFromModulePath(specRelativePath);
    const { pathSegments, groupPathDot } =
      yield* groupPathFromRelativeModulePath(specRelativePath);
    const specImportPath = yield* specImportPathFromGenerated(specRelativePath);
    const runtime = isNodeLeafModule(specRelativePath) ? "Node" : "Convex";

    return {
      relativePath: specRelativePath,
      pathSegments,
      groupPathDot,
      exportName,
      runtime,
      registryGroupPathDot: runtime === "Node" ? exportName : groupPathDot,
      specImportPath,
    } satisfies LeafModule;
  });

const absoluteModulePath = (relativePath: string) =>
  Effect.gen(function* () {
    const confectDirectory = yield* ConfectDirectory.get;
    const path = yield* Path.Path;
    return path.resolve(confectDirectory, relativePath);
  });

/**
 * Validate that the leaf's spec file default-exports a `GroupSpec` whose
 * runtime matches the leaf's location (`Convex` for files outside
 * `confect/node/`, `Node` for files inside it). Returns the validated
 * `GroupSpec` so callers can avoid re-bundling for later inspection (e.g.
 * parent/child name-collision checks at codegen time).
 */
export const validateSpec = (leaf: LeafModule) =>
  Effect.gen(function* () {
    const absolutePath = yield* absoluteModulePath(leaf.relativePath);
    const { module } = yield* Bundler.bundle(absolutePath).pipe(
      Effect.mapError((error) => fromBundlerError(leaf.relativePath, error)),
    );

    const groupSpec = module.default;

    if (!GroupSpec.isGroupSpec(groupSpec)) {
      return yield* new SpecMissingDefaultGroupSpecError({
        specPath: leaf.relativePath,
      });
    }

    if (groupSpec.runtime !== leaf.runtime) {
      return yield* new SpecRuntimeMismatchError({
        specPath: leaf.relativePath,
        expectedRuntime: leaf.runtime,
        actualRuntime: groupSpec.runtime,
      });
    }

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
  Array.findFirst(context.unsafeMap.values(), GroupImpl.isFinalizedGroupImpl);

/**
 * Build the impl layer with a fresh `Registry` so each validation is
 * isolated from prior validations' `FunctionImpl.make` writes. The CLI no
 * longer reads the registry directly — `GroupImpl.finalize` snapshots the
 * registered function names onto the produced `Finalized` `GroupImpl`
 * service value — but a fresh `Ref` is still required because the default
 * `Context.Reference` is cached globally and would otherwise accumulate
 * items across impls.
 */
const buildImplLayer = (implLayer: Layer.Layer<unknown>) =>
  Effect.gen(function* () {
    const registry = Ref.unsafeMake<Registry.RegistryItems>({});
    return yield* Layer.build(
      implLayer as Layer.Layer<unknown, never, never>,
    ).pipe(Effect.provideService(Registry.Registry, registry));
  }).pipe(Effect.scoped);

/**
 * Validate that the leaf's sibling impl file imports the spec, default-exports
 * a finalized `GroupImpl` layer, and provides a `FunctionImpl` for every
 * function declared by the spec.
 */
export const validateImpl = (leaf: LeafModule) =>
  Effect.gen(function* () {
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
  });
