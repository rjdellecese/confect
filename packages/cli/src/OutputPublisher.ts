import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HashSet from "effect/HashSet";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";
import * as Schema from "effect/Schema";
import { ConfectDirectory } from "./ConfectDirectory";
import { ConvexDirectory } from "./ConvexDirectory";
import { ProjectRoot } from "./ProjectRoot";
import * as OutputPlan from "./OutputPlan";
import { logFileRemoved } from "./log";
import { removePathIfExists, writeFileStringAndLog } from "./utils";

export class PathError extends Schema.TaggedError<PathError>()(
  "OutputPathError",
  {
    path: Schema.String,
    reason: Schema.Literals([
      "SymbolicLink",
      "EscapedPath",
      "UnexpectedType",
      "ConflictingTarget",
      "ReservedPath",
    ]),
  },
) {
  override get message(): string {
    return `Cannot publish output at '${this.path}': ${this.reason}`;
  }
}

const nonLink = Schema.decodeUnknownOption(
  Schema.Struct({ code: Schema.Literal("EINVAL") }),
);

const physicalKey = (path: Path.Path, file: string): string =>
  path.sep === "\\" ? file.toLowerCase() : file;

const makeInspector = Effect.fn("OutputPublisher.makeInspector")(function* (
  projectRoot: string,
  owners: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  let root = projectRoot;
  for (const owner of owners) {
    while (true) {
      const relative = path.relative(root, owner);
      if (
        relative !== ".." &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative)
      )
        break;
      const parent = path.dirname(root);
      if (parent === root)
        return yield* new PathError({ path: owner, reason: "EscapedPath" });
      root = parent;
    }
  }
  let observations = HashMap.empty<
    string,
    Option.Option<FileSystem.File.Type>
  >();
  let realRoot = root;
  const inspect: (
    file: string,
    type: "File" | "Directory" | "OwnedEntry" | "UnownedEntry",
  ) => Effect.Effect<
    Option.Option<FileSystem.File.Type>,
    PlatformError | PathError
  > = Effect.fn("OutputPublisher.inspect")(function* (file, type) {
    const relative = path.relative(root, file);
    if (
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      return yield* new PathError({ path: file, reason: "EscapedPath" });
    }
    const key = physicalKey(path, file);
    const previous = HashMap.get(observations, key);
    const info = Option.isSome(previous)
      ? previous.value
      : yield* Effect.gen(function* () {
          if (
            relative !== "" &&
            Option.isNone(yield* inspect(path.dirname(file), "Directory"))
          ) {
            return Option.none<FileSystem.File.Type>();
          }
          const link = yield* fs.readLink(file).pipe(
            Effect.as("Link" as const),
            Effect.catchIf(
              (error) =>
                error.reason._tag === "Unknown" &&
                Option.isSome(nonLink(error.reason.cause)),
              () => Effect.succeed("NonLink" as const),
            ),
            Effect.catchIf(
              (error) =>
                (type === "File" || type === "Directory") &&
                error.reason._tag === "NotFound",
              () => Effect.succeed("Missing" as const),
            ),
          );
          if (link === "Missing") return Option.none<FileSystem.File.Type>();
          if (link === "Link" && type === "UnownedEntry")
            return Option.none<FileSystem.File.Type>();
          if (link === "Link")
            return yield* new PathError({ path: file, reason: "SymbolicLink" });
          const real = yield* fs.realPath(file);
          if (relative === "") realRoot = real;
          if (path.relative(path.resolve(realRoot, relative), real) !== "") {
            return yield* new PathError({ path: file, reason: "EscapedPath" });
          }
          return Option.some((yield* fs.stat(file)).type);
        });
    if (
      Option.isSome(info) &&
      (type === "File" || type === "Directory") &&
      info.value !== type
    ) {
      return yield* new PathError({ path: file, reason: "UnexpectedType" });
    }
    observations = HashMap.set(observations, key, info);
    return info;
  });
  return inspect;
});

export const discover = Effect.fn("OutputPublisher.discover")(function* (
  namespace: OutputPlan.Target["_tag"],
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.resolve(yield* ProjectRoot.get);
  const owner = path.resolve(
    yield* namespace === "Registry"
      ? ConfectDirectory.get
      : ConvexDirectory.get,
  );
  const directory =
    namespace === "Registry"
      ? path.join(owner, "_generated", "registeredFunctions")
      : owner;
  const inspect = yield* makeInspector(root, [owner]);
  if (Option.isNone(yield* inspect(directory, "Directory"))) return [];
  const visit: (
    current: string,
  ) => Effect.Effect<
    ReadonlyArray<OutputPlan.Target>,
    PlatformError | PathError,
    FileSystem.FileSystem | Path.Path
  > = Effect.fnUntraced(function* (current) {
    const entries = yield* fs.readDirectory(current);
    return Array.flatten(
      yield* Effect.forEach(entries, (entry) =>
        Effect.gen(function* () {
          const file = path.join(current, entry);
          const relativePath = path
            .relative(directory, file)
            .split(path.sep)
            .join("/");
          const owned =
            path.extname(file) === ".ts" &&
            (namespace === "Registry" ||
              OutputPlan.isOwnedConvexModule(physicalKey(path, relativePath)));
          const observation = yield* inspect(
            file,
            owned ? "OwnedEntry" : "UnownedEntry",
          );
          if (Option.isNone(observation)) return [];
          const type = observation.value;
          if (type === "Directory") return yield* visit(file);
          if (!owned) return [];
          if (type !== "File")
            return yield* new PathError({
              path: file,
              reason: "UnexpectedType",
            });
          return [
            namespace === "Registry"
              ? OutputPlan.Target.Registry({ relativePath })
              : OutputPlan.Target.ConvexModule({ relativePath }),
          ];
        }),
      ),
    );
  });
  return yield* visit(directory);
});

export const publish = Effect.fn("OutputPublisher.publish")(function* (
  plan: OutputPlan.OutputPlan,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.resolve(yield* ProjectRoot.get);
  const confect = path.resolve(yield* ConfectDirectory.get);
  const convex = path.resolve(yield* ConvexDirectory.get);
  let paths = HashSet.empty<string>();
  let directories = HashSet.empty<string>();
  const resolved = yield* Effect.forEach(plan.operations, (operation) =>
    Effect.gen(function* () {
      const file = OutputPlan.Target.$match(operation.target, {
        Registry: ({ relativePath }) =>
          path.join(confect, "_generated", "registeredFunctions", relativePath),
        ConvexModule: ({ relativePath }) => path.join(convex, relativePath),
      });
      if (
        operation.target._tag === "ConvexModule" &&
        !OutputPlan.isOwnedConvexModule(
          physicalKey(path, operation.target.relativePath),
        )
      ) {
        return yield* new PathError({ path: file, reason: "ReservedPath" });
      }
      const key = physicalKey(path, file);
      const segments = key.split(path.sep);
      const parents = segments
        .slice(0, -1)
        .map((_, index) => segments.slice(0, index + 1).join(path.sep));
      if (
        HashSet.has(paths, key) ||
        HashSet.has(directories, key) ||
        parents.some((parent) => HashSet.has(paths, parent))
      ) {
        return yield* new PathError({
          path: file,
          reason: "ConflictingTarget",
        });
      }
      paths = HashSet.add(paths, key);
      directories = HashSet.union(directories, HashSet.fromIterable(parents));
      return { operation, file };
    }),
  );
  const inspect = yield* makeInspector(root, [confect, convex]);
  const inspected = yield* Effect.forEach(resolved, ({ operation, file }) =>
    inspect(file, "File").pipe(
      Effect.map((info) => ({ operation, file, exists: Option.isSome(info) })),
    ),
  );
  let preparedDirectories = HashSet.empty<string>();
  yield* Effect.forEach(inspected, ({ operation, file, exists }) =>
    OutputPlan.Operation.$match(operation, {
      Write: ({ contents }) =>
        Effect.gen(function* () {
          const directory = path.dirname(file);
          const key = physicalKey(path, directory);
          if (!HashSet.has(preparedDirectories, key)) {
            if (!(yield* fs.exists(directory)))
              yield* fs.makeDirectory(directory, { recursive: true });
            preparedDirectories = HashSet.add(preparedDirectories, key);
          }
          yield* writeFileStringAndLog(file, contents);
        }),
      Remove: ({ target }) =>
        Effect.gen(function* () {
          if (target._tag === "ConvexModule")
            yield* Effect.logDebug(
              `Removing group '${target.relativePath}'...`,
            );
          yield* removePathIfExists(file);
          if (target._tag === "ConvexModule")
            yield* Effect.logDebug(`Group '${target.relativePath}' removed`);
          if (exists || target._tag === "ConvexModule")
            yield* logFileRemoved(file);
        }),
    }),
  );
});
