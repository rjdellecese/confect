import { assert, expect, it } from "@effect/vitest";
import * as Watcher from "@confect/cli/Watcher";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as SyncState from "@confect/cli/SyncState";
import * as WatchBuild from "@confect/cli/WatchBuild";
import * as HashMap from "effect/HashMap";

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
