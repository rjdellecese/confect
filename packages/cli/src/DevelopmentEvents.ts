import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Filter from "effect/Filter";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ConfectDirectory } from "./ConfectDirectory";
import { ConvexDirectory } from "./ConvexDirectory";
import { ProjectRoot } from "./ProjectRoot";

export type Event = Data.TaggedEnum<{
  Authored: {
    readonly file: string;
    readonly kind: "Create" | "Update" | "Remove";
  };
  Rescan: {};
  Restart: { readonly file: string };
}>;
export const Event = Data.taggedEnum<Event>();

const configurationFiles = [
  "package.json",
  "tsconfig.json",
  "jsconfig.json",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  ".pnp.cjs",
  ".pnp.data.json",
];

export const isArtifact = (file: string): boolean =>
  Array.some(
    file.split(/[/\\]/),
    (part) =>
      part.startsWith(".confect-bundle-") ||
      part.startsWith(".confect-compiler-") ||
      part.startsWith(".confect-artifacts-"),
  );

export const watch = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const projectRoot = yield* ProjectRoot.get;
  const confect = yield* ConfectDirectory.get;
  const convex = yield* ConvexDirectory.get;
  yield* fs.makeDirectory(confect, { recursive: true });
  yield* fs.makeDirectory(convex, { recursive: true });
  const removedDirectory = Schema.Struct({
    code: Schema.Literal("ENOENT"),
    syscall: Schema.Literal("scandir"),
    path: Schema.String,
  });
  const confectEvents = fs.watch(confect, { recursive: true }).pipe(
    Stream.filterMap(
      Filter.fromPredicateOption(
        (event: FileSystem.WatchEvent): Option.Option<Event> => {
          const file = path.resolve(confect, event.path);
          const relative = path.relative(confect, file);
          if (
            isArtifact(file) ||
            relative.split(path.sep).includes("_generated")
          )
            return Option.none();
          if (Array.contains(configurationFiles, path.basename(file)))
            return Option.some(Event.Restart({ file }));
          return Option.some(Event.Authored({ file, kind: event._tag }));
        },
      ),
    ),
  );
  const convexEvents = fs.watch(convex).pipe(
    Stream.filterMap(
      Filter.fromPredicateOption(
        (event: FileSystem.WatchEvent): Option.Option<Event> => {
          const file = path.resolve(convex, event.path);
          const relative = path.relative(convex, file);
          if (relative === "tsconfig.json" || relative === "package.json")
            return Option.some(Event.Restart({ file }));
          return relative === "convex.config.ts"
            ? Option.some(Event.Authored({ file, kind: event._tag }))
            : Option.none();
        },
      ),
    ),
  );
  const projectEvents = fs.watch(projectRoot).pipe(
    Stream.filterMap(
      Filter.fromPredicateOption(
        (event: FileSystem.WatchEvent): Option.Option<Event> => {
          const file = path.resolve(projectRoot, event.path);
          return Array.contains(
            configurationFiles,
            path.relative(projectRoot, file),
          )
            ? Option.some(Event.Restart({ file }))
            : Option.none();
        },
      ),
    ),
  );
  const recover = (error: PlatformError) =>
    Effect.gen(function* () {
      const removed = Schema.decodeUnknownOption(removedDirectory)(
        error.reason.cause,
      );
      if (Option.isNone(removed)) return false;
      const relative = path.relative(confect, removed.value.path);
      return (
        relative !== "" &&
        relative !== ".." &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative) &&
        (yield* fs.exists(confect).pipe(Effect.orElseSucceed(() => false)))
      );
    });
  return {
    confectEvents,
    convexEvents,
    projectEvents,
    recover,
    schedule: Schedule.spaced("10 millis"),
  };
});
