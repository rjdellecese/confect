import { FileSystem, Path } from "@effect/platform";
import { Array, Effect, String } from "effect";
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
