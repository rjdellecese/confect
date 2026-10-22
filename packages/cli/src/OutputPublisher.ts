import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HashSet from "effect/HashSet";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";
import * as Schema from "effect/Schema";
import * as CodegenError from "./CodegenError";
import { SCOPED_REFS_HEADER } from "./SpecAssemblyNode";
import { ConfectDirectory } from "./ConfectDirectory";
import { ConvexDirectory } from "./ConvexDirectory";
import { ProjectRoot } from "./ProjectRoot";
import * as OutputPlan from "./OutputPlan";
import { logFileAdded, logFileModified, logFileRemoved } from "./log";
import { removePathIfExists, writeFileString } from "./utils";

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

const inspectScopedRefFiles = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = path.resolve(yield* ConfectDirectory.get);
  const realConfectDirectory = yield* fs.realPath(confectDirectory);
  const inspect = Effect.fnUntraced(function* (file: string) {
    const link = yield* fs.readLink(file).pipe(
      Effect.asSome,
      Effect.catchIf(
        (error) =>
          error.reason._tag === "Unknown" &&
          Option.isSome(nonLink(error.reason.cause)),
        () => Effect.succeedNone,
      ),
    );
    if (Option.isSome(link)) {
      return yield* new CodegenError.ScopedRefsPathOccupiedError({
        path: file,
        reason: "SymbolicLink",
      });
    }
    const real = yield* fs.realPath(file);
    const expected = path.resolve(
      realConfectDirectory,
      path.relative(confectDirectory, file),
    );
    if (path.relative(expected, real) !== "") {
      return yield* new CodegenError.ScopedRefsPathOccupiedError({
        path: file,
        reason: "EscapedPath",
      });
    }
    return yield* fs.stat(file);
  });
  const generated = path.join(confectDirectory, "_generated");
  const directory = path.join(generated, "refs");
  for (const file of [generated, directory]) {
    const info = yield* inspect(file).pipe(
      Effect.asSome,
      Effect.catchIf(
        (error) =>
          error._tag === "PlatformError" && error.reason._tag === "NotFound",
        () => Effect.succeedNone,
      ),
    );
    if (Option.isNone(info)) return [];
    if (info.value.type !== "Directory") {
      return yield* new CodegenError.ScopedRefsPathOccupiedError({
        path: file,
        reason: "UnexpectedType",
      });
    }
  }
  const visit: (
    current: string,
  ) => Effect.Effect<
    ReadonlyArray<string>,
    PlatformError | CodegenError.ScopedRefsPathOccupiedError
  > = Effect.fnUntraced(function* (current) {
    const entries = yield* fs.readDirectory(current);
    return Array.flatten(
      yield* Effect.forEach(
        entries,
        Effect.fnUntraced(function* (entry) {
          const file = path.join(current, entry);
          const info = yield* inspect(file);
          if (info.type === "Directory") return yield* visit(file);
          if (info.type !== "File") {
            return yield* new CodegenError.ScopedRefsPathOccupiedError({
              path: file,
              reason: "UnexpectedType",
            });
          }
          return file.endsWith(".ts") ? [path.relative(directory, file)] : [];
        }),
      ),
    );
  });
  return yield* visit(directory);
});

const isOwnedScopedRef = (contents: string) =>
  contents.startsWith(SCOPED_REFS_HEADER + "\n") ||
  contents.startsWith(SCOPED_REFS_HEADER + "\r\n");

export const discover = Effect.fn("OutputPublisher.discover")(function* (
  namespace: Exclude<OutputPlan.Target["_tag"], "Binding" | "ConvexBinding">,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  if (namespace === "ScopedRef") {
    const existing = yield* inspectScopedRefFiles;
    const directory = path.join(
      yield* ConfectDirectory.get,
      "_generated",
      "refs",
    );
    return Array.getSomes(
      yield* Effect.forEach(existing, (relativePath) =>
        fs.readFileString(path.join(directory, relativePath)).pipe(
          Effect.map((contents) =>
            isOwnedScopedRef(contents)
              ? Option.some(
                  OutputPlan.Target.ScopedRef({
                    relativePath: relativePath.split(path.sep).join("/"),
                  }),
                )
              : Option.none(),
          ),
        ),
      ),
    );
  }
  const root = path.resolve(yield* ProjectRoot.get);
  const owner = path.resolve(
    yield* namespace === "ConvexModule"
      ? ConvexDirectory.get
      : ConfectDirectory.get,
  );
  const directory =
    namespace === "ConvexModule"
      ? owner
      : path.join(
          owner,
          "_generated",
          namespace === "Registry" ? "registeredFunctions" : "tables",
        );
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
            (namespace !== "ConvexModule" ||
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
          return [OutputPlan.Target[namespace]({ relativePath })];
        }),
      ),
    );
  });
  return yield* visit(directory);
});

export const publish = Effect.fn("OutputPublisher.publish")(function* (
  plan: OutputPlan.OutputPlan,
  logChange: (
    change: "Added" | "Modified" | "Removed",
    file: string,
  ) => Effect.Effect<void, never, ProjectRoot | Path.Path> = (change, file) =>
    ({
      Added: logFileAdded,
      Modified: logFileModified,
      Removed: logFileRemoved,
    })[change](file),
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
        ConvexBinding: ({ relativePath }) => path.join(convex, relativePath),
        TableWrapper: ({ relativePath }) =>
          path.join(confect, "_generated", "tables", relativePath),
        ScopedRef: ({ relativePath }) =>
          path.join(confect, "_generated", "refs", relativePath),
        Binding: ({ relativePath }) =>
          path.join(confect, "_generated", relativePath),
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
    Effect.gen(function* () {
      const info = yield* inspect(file, "File").pipe(
        Effect.mapError((error) =>
          error._tag === "OutputPathError" &&
          operation.target._tag === "ScopedRef" &&
          (error.reason === "SymbolicLink" ||
            error.reason === "EscapedPath" ||
            error.reason === "UnexpectedType")
            ? new CodegenError.ScopedRefsPathOccupiedError({
                path: error.path,
                reason: error.reason,
              })
            : error,
        ),
      );
      const exists = Option.isSome(info);
      if (exists && operation.target._tag === "ScopedRef") {
        const contents = yield* fs.readFileString(file);
        if (!isOwnedScopedRef(contents)) {
          if (operation._tag === "Remove") return Option.none();
          return yield* new CodegenError.ScopedRefsPathOccupiedError({
            path: file,
            reason: "UnownedFile",
          });
        }
      }
      return Option.some({ operation, file, exists });
    }),
  );
  let preparedDirectories = HashSet.empty<string>();
  yield* Effect.forEach(
    Array.getSomes(inspected),
    ({ operation, file, exists }) =>
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
            const change = yield* writeFileString(file, contents);
            if (change !== "Unchanged") yield* logChange(change, file);
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
              yield* logChange("Removed", file);
          }),
      }),
  );
});
