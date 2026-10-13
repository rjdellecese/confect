import { assert, expect, it } from "@effect/vitest";
import * as Watcher from "@confect/cli/Watcher";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as SyncState from "@confect/cli/SyncState";

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
