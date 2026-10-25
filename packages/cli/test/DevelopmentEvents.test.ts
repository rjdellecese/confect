import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as DevelopmentEvents from "@confect/cli/DevelopmentEvents";
import { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import { ConvexDirectory } from "@confect/cli/ConvexDirectory";
import type * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

layer(NodeServices.layer)("DevelopmentEvents", (it) => {
  it.effect("leaves Convex resolution metadata to the compiler", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const confect = path.join(root, "confect");
      const convex = path.join(root, "convex");
      const events = yield* Queue.unbounded<FileSystem.WatchEvent>();
      const watched = yield* DevelopmentEvents.watch.pipe(
        Effect.provideService(ConfectDirectory, {
          get: Effect.succeed(confect),
        }),
        Effect.provideService(ConvexDirectory, {
          get: Effect.succeed(convex),
        }),
        Effect.provideService(FileSystem.FileSystem, {
          ...fs,
          watch: (directory) => {
            expect(directory).toBe(convex);
            return Stream.fromQueue(events);
          },
        }),
      );
      yield* Queue.offerAll(events, [
        { _tag: "Update", path: "tsconfig.json" },
        { _tag: "Update", path: "package.json" },
        { _tag: "Create", path: "convex.config.ts" },
        { _tag: "Update", path: "convex.config.ts" },
      ]);
      expect(
        yield* watched.convexEvents.pipe(Stream.take(2), Stream.runCollect),
      ).toEqual([
        DevelopmentEvents.Event.Authored({
          file: path.join(convex, "convex.config.ts"),
          kind: "Create",
        }),
        DevelopmentEvents.Event.Authored({
          file: path.join(convex, "convex.config.ts"),
          kind: "Update",
        }),
      ]);
    }).pipe(Effect.scoped),
  );

  it.effect(
    "subscribes only to authored directories and follows directory replacement",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const confect = path.join(root, "confect");
        const convex = path.join(root, "convex");
        const nested = path.join(confect, "nested");
        const ignored = ["_generated/deep", ".confect-artifacts-test/deep"];
        yield* fs.makeDirectory(nested, { recursive: true });
        yield* Effect.forEach(ignored, (directory) =>
          fs.makeDirectory(path.join(confect, directory), { recursive: true }),
        );
        const subscribed = yield* Queue.unbounded<{
          readonly directory: string;
          readonly events: Queue.Queue<FileSystem.WatchEvent, Cause.Done>;
        }>();
        const closed = yield* Ref.make<ReadonlyArray<string>>([]);
        const scanned = yield* Ref.make<ReadonlyArray<string>>([]);
        const events = yield* Queue.unbounded<DevelopmentEvents.Event>();
        const watched = yield* DevelopmentEvents.watch.pipe(
          Effect.provideService(ConfectDirectory, {
            get: Effect.succeed(confect),
          }),
          Effect.provideService(ConvexDirectory, {
            get: Effect.succeed(convex),
          }),
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            readDirectory: (directory, options) =>
              Ref.update(scanned, (paths) => [...paths, directory]).pipe(
                Effect.andThen(fs.readDirectory(directory, options)),
              ),
            watch: (directory, options) =>
              Stream.callback<FileSystem.WatchEvent>((output) =>
                Effect.gen(function* () {
                  expect(options?.recursive).not.toBe(true);
                  yield* Queue.offer(subscribed, { directory, events: output });
                  return yield* Effect.never;
                }).pipe(
                  Effect.ensuring(
                    Ref.update(closed, (paths) => [...paths, directory]),
                  ),
                ),
              ),
          }),
        );
        const fiber = yield* watched.confectEvents.pipe(
          Stream.runForEach((event) => Queue.offer(events, event)),
          Effect.forkScoped,
        );
        const first = yield* Queue.take(subscribed);
        const second = yield* Queue.take(subscribed);
        expect([first.directory, second.directory]).toEqual([confect, nested]);
        yield* Queue.offer(first.events, {
          _tag: "Update",
          path: "ordinary.ts",
        });
        expect(yield* Queue.take(events)).toEqual(
          DevelopmentEvents.Event.Authored({
            file: path.join(confect, "ordinary.ts"),
            kind: "Update",
          }),
        );
        expect(yield* Ref.get(scanned)).toEqual([confect, nested]);
        yield* Queue.offer(first.events, {
          _tag: "Create",
          path: "_generated",
        });
        yield* Queue.offer(first.events, {
          _tag: "Create",
          path: ".confect-artifacts-test",
        });
        yield* Queue.offer(second.events, {
          _tag: "Update",
          path: "tsconfig.json",
        });
        expect(yield* Queue.take(events)).toEqual(
          DevelopmentEvents.Event.Authored({
            file: path.join(nested, "tsconfig.json"),
            kind: "Update",
          }),
        );
        expect(yield* Queue.size(subscribed)).toBe(0);
        expect(yield* Ref.get(scanned)).toEqual([confect, nested]);
        yield* fs.remove(nested, { recursive: true });
        yield* Queue.offer(first.events, { _tag: "Remove", path: "nested" });
        expect(yield* Queue.take(events)).toEqual(
          DevelopmentEvents.Event.Authored({ file: nested, kind: "Remove" }),
        );
        expect(yield* Ref.get(closed)).toContain(nested);
        yield* fs.makeDirectory(path.join(nested, "deep"), { recursive: true });
        yield* Queue.offer(first.events, { _tag: "Create", path: "nested" });
        const replacement = yield* Queue.take(subscribed);
        const deep = yield* Queue.take(subscribed);
        expect([replacement.directory, deep.directory]).toEqual([
          nested,
          path.join(nested, "deep"),
        ]);
        expect(yield* Queue.take(events)).toEqual(
          DevelopmentEvents.Event.Authored({ file: nested, kind: "Create" }),
        );
        yield* Queue.offer(deep.events, {
          _tag: "Create",
          path: "new.spec.ts",
        });
        expect(yield* Queue.take(events)).toEqual(
          DevelopmentEvents.Event.Authored({
            file: path.join(nested, "deep/new.spec.ts"),
            kind: "Create",
          }),
        );
        yield* fs.remove(nested, { recursive: true });
        yield* fs.makeDirectory(nested);
        yield* Queue.offer(first.events, { _tag: "Create", path: "nested" });
        expect((yield* Queue.take(subscribed)).directory).toBe(nested);
        expect(yield* Queue.take(events)).toEqual(
          DevelopmentEvents.Event.Authored({ file: nested, kind: "Create" }),
        );
        expect(yield* Ref.get(closed)).toHaveLength(3);
        yield* Fiber.interrupt(fiber);
        expect(yield* Ref.get(closed)).toHaveLength(5);
      }).pipe(Effect.scoped),
  );
});
