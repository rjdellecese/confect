import { assert, expect, it, layer } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Watcher from "@confect/cli/Watcher";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as SyncState from "@confect/cli/SyncState";
import * as WatchBuild from "@confect/cli/WatchBuild";
import * as HashMap from "effect/HashMap";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Stream from "effect/Stream";
import { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import { ConvexDirectory } from "@confect/cli/ConvexDirectory";
import { ProjectRoot } from "@confect/cli/ProjectRoot";
import * as Project from "./integration/Project";

it("allows readiness only for empty or successfully refreshed watchers", () => {
  expect(Watcher.isRefreshSuccessful({ _tag: "Empty" })).toBe(true);
  expect(
    Watcher.isRefreshSuccessful({
      _tag: "Observed",
      outcome: WatchBuild.Outcome.Succeeded({
        snapshot: {
          fingerprints: HashMap.empty(),
          graph: HashMap.empty(),
          outputHash: "output",
        },
        warnings: [],
      }),
    }),
  ).toBe(true);
  expect(
    Watcher.isRefreshSuccessful({
      _tag: "Observed",
      outcome: WatchBuild.Outcome.Failed({
        fingerprints: HashMap.empty(),
        failures: [
          WatchBuild.Failure.InvalidBuildResult({ missing: "metafile" }),
        ],
        warnings: [],
      }),
    }),
  ).toBe(false);
});

it.effect("rejects refresh before the watcher has initialized", () =>
  Effect.gen(function* () {
    const signal = yield* Queue.sliding<void>(1);
    const pending = yield* Ref.make(SyncState.empty);
    const watcher = yield* Watcher.make(signal, pending);
    const refreshed = yield* watcher.refresh.pipe(Effect.result);
    assert(Result.isFailure(refreshed));
    expect(refreshed.failure).toMatchObject({
      _tag: "WatcherOperationError",
      operation: "refresh",
    });
    expect(yield* watcher.diagnostics).toEqual({ errors: [], warnings: [] });
  }),
);

it("parses reported build rejections without confusing operation errors or malformed diagnostics", () => {
  expect(Watcher.parseFailure({ errors: [{ text: "syntax error" }] })).toEqual(
    Option.some({ errors: [{ text: "syntax error" }] }),
  );
  expect(Watcher.parseFailure({ errors: [] })).toEqual(Option.none());
  expect(Watcher.parseFailure({ errors: ["invalid"] })).toEqual(Option.none());
  expect(Watcher.parseFailure(new Error("service stopped"))).toEqual(
    Option.none(),
  );
});

layer(NodeServices.layer, { excludeTestServices: true })(
  "directory watch recovery",
  (test) => {
    test.effect.each([
      {
        name: "removed child directory",
        code: "ENOENT",
        child: true,
        recover: true,
      },
      {
        name: "removed root directory",
        code: "ENOENT",
        child: false,
        recover: false,
      },
      {
        name: "permission failure",
        code: "EACCES",
        child: true,
        recover: false,
      },
    ])(
      "handles $name without hiding unrelated errors",
      ({ code, child, recover }) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          const confect = path.join(project.root, "confect");
          const error = PlatformError.systemError({
            _tag: "Unknown",
            module: "FileSystem",
            method: "watch",
            pathOrDescriptor: confect,
            cause: {
              code,
              syscall: "scandir",
              path: child ? path.join(confect, "removed") : confect,
            },
          });
          const restored = yield* Deferred.make<void>();
          let subscriptions = 0;
          const signal = yield* Queue.sliding<void>(1);
          const pending = yield* Ref.make(SyncState.empty);
          const watcher = yield* Watcher.make(signal, pending);
          const running = watcher.run.pipe(
            Effect.provideService(ProjectRoot, {
              get: Effect.succeed(project.root),
            }),
            Effect.provideService(ConfectDirectory, {
              get: Effect.succeed(confect),
            }),
            Effect.provideService(ConvexDirectory, {
              get: Effect.succeed(path.join(project.root, "convex")),
            }),
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              watch: (directory, options) =>
                directory === confect
                  ? Stream.suspend(() => {
                      subscriptions++;
                      return subscriptions === 1
                        ? Stream.fail(error)
                        : Stream.fromEffect(
                            Deferred.succeed(restored, undefined),
                          ).pipe(Stream.drain, Stream.concat(Stream.never));
                    })
                  : fs.watch(directory, options),
            }),
          );
          if (recover) {
            const fiber = yield* running.pipe(Effect.forkScoped);
            yield* Deferred.await(restored).pipe(Effect.timeout("5 seconds"));
            yield* Fiber.interrupt(fiber);
            expect(subscriptions).toBe(2);
          } else {
            const result = yield* running.pipe(Effect.result);
            assert(Result.isFailure(result));
            expect(result.failure).toBe(error);
            expect(subscriptions).toBe(1);
          }
        }).pipe(Effect.scoped),
      { timeout: 15000 },
    );
  },
);
