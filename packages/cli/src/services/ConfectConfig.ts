import { FileSystem, Path } from "@effect/platform";
import { Effect, Ref } from "effect";
import { bundleAndImport } from "../utils";
import { ConfectDirectory } from "./ConfectDirectory";

const isValidPreservedConvexFileName = (fileName: string) =>
  fileName.length > 0 &&
  !fileName.includes("/") &&
  !fileName.includes("\\") &&
  !fileName.includes("..");

const EMPTY_PRESERVED_FILES = new Set<string>();

const getPreservedConvexFileNamesFromConfig = (config: unknown) => {
  if (typeof config !== "object" || config === null) {
    return EMPTY_PRESERVED_FILES;
  }

  const record = config as Record<string, unknown>;

  const preservedSet = new Set<string>();

  const singleCandidate =
    typeof record.preserveConvexFileName === "string"
      ? record.preserveConvexFileName
      : typeof record.preserveConvexFile === "string"
        ? record.preserveConvexFile
        : null;

  if (
    singleCandidate !== null &&
    isValidPreservedConvexFileName(singleCandidate)
  ) {
    preservedSet.add(singleCandidate);
  }

  const listCandidate = record.preserveConvexFileNames;
  if (Array.isArray(listCandidate)) {
    for (const value of listCandidate) {
      if (typeof value === "string" && isValidPreservedConvexFileName(value)) {
        preservedSet.add(value);
      }
    }
  }

  return preservedSet;
};

const loadConfectJsonConfig = (configPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const contents = yield* fs.readFileString(configPath);
    const parsed = yield* Effect.try({
      try: () => JSON.parse(contents) as unknown,
      catch: () => null,
    });

    return getPreservedConvexFileNamesFromConfig(parsed);
  });

const loadConfectTsConfig = (configPath: string) =>
  bundleAndImport(configPath).pipe(
    Effect.map((configModule) => {
      const config = configModule.default ?? configModule.config;
      return getPreservedConvexFileNamesFromConfig(config);
    }),
  );

const findPreservedConvexFileNames = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

  const confectTsConfigPath = path.join(confectDirectory, "confect.config.ts");
  if (yield* fs.exists(confectTsConfigPath)) {
    return yield* loadConfectTsConfig(confectTsConfigPath).pipe(
      Effect.catchAll(() => Effect.succeed(EMPTY_PRESERVED_FILES)),
    );
  }

  const confectJsonPath = path.join(confectDirectory, "confect.json");
  if (yield* fs.exists(confectJsonPath)) {
    return yield* loadConfectJsonConfig(confectJsonPath).pipe(
      Effect.catchAll(() => Effect.succeed(EMPTY_PRESERVED_FILES)),
    );
  }

  return EMPTY_PRESERVED_FILES;
});

export class ConfectConfig extends Effect.Service<ConfectConfig>()(
  "@confect/cli/services/ConfectConfig",
  {
    effect: Effect.gen(function* () {
      const preservedConvexFileNames = yield* findPreservedConvexFileNames;
      const ref = yield* Ref.make<ReadonlySet<string>>(
        preservedConvexFileNames,
      );

      return { getPreservedConvexFileNames: Ref.get(ref) } as const;
    }),
    dependencies: [ConfectDirectory.Default],
    accessors: true,
  },
) {}
