import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as FiberMap from "effect/FiberMap";
import * as Filter from "effect/Filter";
import * as HashSet from "effect/HashSet";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import { ConfectDirectory } from "./ConfectDirectory";
import { ConvexDirectory } from "./ConvexDirectory";
import { ProjectRoot } from "./ProjectRoot";

export type Event = Data.TaggedEnum<{
  Authored: {
    readonly file: string;
    readonly kind: "Create" | "Update" | "Remove";
  };
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
  const confectEvents = Stream.callback<Event, PlatformError>((output) =>
    Effect.gen(function* () {
      const watchers = yield* FiberMap.make<string, void, PlatformError>();
      const incoming = yield* Queue.unbounded<{
        readonly directory: string;
        readonly ancestors: HashSet.HashSet<string>;
        readonly event: FileSystem.WatchEvent;
      }>();
      const ignored = (file: string) =>
        isArtifact(file) ||
        Array.contains(
          path.relative(confect, file).split(path.sep),
          "_generated",
        );
      const add = Effect.fn("DevelopmentEvents.addDirectory")(function* (
        directory: string,
        ancestors: HashSet.HashSet<string>,
      ): Effect.fn.Return<void, PlatformError> {
        if (yield* FiberMap.has(watchers, directory)) return;
        const real = yield* fs.realPath(directory);
        if (HashSet.has(ancestors, real)) return;
        const nextAncestors = HashSet.add(ancestors, real);
        yield* FiberMap.run(
          watchers,
          directory,
          fs.watch(directory).pipe(
            Stream.catchIf(
              (error) =>
                directory !== confect && error.reason._tag === "NotFound",
              () => Stream.empty,
            ),
            Stream.runForEach((event) =>
              Queue.offer(incoming, {
                directory,
                ancestors: nextAncestors,
                event,
              }),
            ),
          ),
        );
        yield* Effect.forEach(yield* fs.readDirectory(directory), (name) =>
          addIfDirectory(path.join(directory, name), nextAncestors),
        );
      });
      const addIfDirectory = (
        file: string,
        ancestors: HashSet.HashSet<string>,
      ) =>
        Effect.gen(function* () {
          if (ignored(file)) return;
          if ((yield* fs.stat(file)).type === "Directory")
            yield* add(file, ancestors);
        }).pipe(
          Effect.catchIf(
            (error) => error.reason._tag === "NotFound",
            () => Effect.void,
          ),
        );
      yield* add(confect, HashSet.empty());
      yield* Effect.all(
        [
          FiberMap.join(watchers),
          Effect.gen(function* () {
            const { directory, ancestors, event } = yield* Queue.take(incoming);
            const file = path.resolve(directory, event.path);
            if (ignored(file)) return;
            if (event._tag !== "Update") {
              const removed = Array.filter(
                Array.fromIterable(watchers),
                ([watched]) =>
                  watched === file || watched.startsWith(`${file}${path.sep}`),
              );
              yield* Effect.forEach(removed, ([watched]) =>
                FiberMap.remove(watchers, watched),
              );
              if (event._tag === "Create")
                yield* addIfDirectory(file, ancestors);
            }
            yield* Queue.offer(
              output,
              Array.contains(configurationFiles, path.basename(file))
                ? Event.Restart({ file })
                : Event.Authored({ file, kind: event._tag }),
            );
          }).pipe(Effect.forever),
        ],
        { concurrency: "unbounded" },
      );
    }),
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
  return {
    confectEvents,
    convexEvents,
    projectEvents,
  };
});
