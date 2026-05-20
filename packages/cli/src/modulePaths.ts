import { FileSystem, Path } from "@effect/platform";
import { Array, Effect, String } from "effect";
import { ConfectDirectory } from "./ConfectDirectory";

export interface LeafModule {
  readonly relativePath: string;
  readonly pathSegments: readonly [string, ...string[]];
  readonly groupPathDot: string;
  readonly registryGroupPathDot: string;
  readonly exportName: string;
  readonly runtime: "Convex" | "Node";
}

const SPEC_SUFFIX = ".spec.ts";
const IMPL_SUFFIX = ".impl.ts";

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
    const stem = ext === ".ts" ? name.replace(/\.spec$/, "") : name;
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

export const specPathForImpl = (implRelativePath: string) =>
  Effect.succeed(implRelativePath.replace(IMPL_SUFFIX, SPEC_SUFFIX));

export const implPathForSpec = (specRelativePath: string) =>
  Effect.succeed(specRelativePath.replace(SPEC_SUFFIX, IMPL_SUFFIX));

export const isNodeLeafModule = (relativePath: string) =>
  relativePath.startsWith("node/") || relativePath.startsWith("node\\");

export const registeredFunctionsRelativePath = (leaf: LeafModule) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return path.join(
      "registeredFunctions",
      ...leaf.pathSegments.slice(leaf.runtime === "Node" ? 1 : 0),
    ) + ".ts";
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
    if (!relativePath.endsWith(SPEC_SUFFIX)) {
      return false;
    }

    if (excludedFiles.has(relativePath)) {
      return false;
    }

    const segments = String.split(relativePath, path.sep);
    return !segments.some((segment) => excludedDirs.has(segment));
  });
});

export const toLeafModule = (specRelativePath: string) =>
  Effect.gen(function* () {
    const exportName = yield* exportNameFromModulePath(specRelativePath);
    const { pathSegments, groupPathDot } =
      yield* groupPathFromRelativeModulePath(specRelativePath);
    const runtime = isNodeLeafModule(specRelativePath) ? "Node" : "Convex";

    return {
      relativePath: specRelativePath,
      pathSegments,
      groupPathDot,
      exportName,
      runtime,
      registryGroupPathDot: runtime === "Node" ? exportName : groupPathDot,
    } satisfies LeafModule;
  });
