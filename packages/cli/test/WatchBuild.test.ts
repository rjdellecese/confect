import { assert, expect, it } from "@effect/vitest";
import * as WatchBuild from "@confect/cli/WatchBuild";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";
import * as Result from "effect/Result";
import type * as esbuild from "esbuild";
import type * as WatchGraph from "@confect/cli/WatchGraph";

const crypto = Crypto.make({
  randomBytes: (size) => new Uint8Array(size),
  digest: () => Effect.succeed(new Uint8Array([1, 2])),
});
const result = (): esbuild.BuildResult => ({
  errors: [],
  warnings: [],
  mangleCache: undefined,
  metafile: { inputs: {}, outputs: {} },
  outputFiles: [
    {
      path: "out.js",
      contents: new Uint8Array([3]),
      hash: "hash",
      text: "output",
    },
  ],
});

const snapshot = (
  fingerprints: WatchBuild.Fingerprints,
  graph: WatchGraph.WatchGraph = HashMap.empty(),
  outputHash = "output",
): WatchBuild.State =>
  WatchBuild.State.Succeeded({
    snapshot: { fingerprints, graph, outputHash },
    warnings: [],
  });

const successfulOutcome = WatchBuild.Outcome.Succeeded({
  snapshot: {
    fingerprints: HashMap.empty(),
    graph: HashMap.empty(),
    outputHash: "output",
  },
  warnings: [],
});

const request = (progress: WatchBuild.Progress) =>
  WatchBuild.request(progress, WatchBuild.makeRequestId());

it.effect(
  "checks captured inputs against current files without changing the snapshot",
  () =>
    Effect.gen(function* () {
      const captured = {
        fingerprints: HashMap.make(["input.ts", "0102"]),
        graph: HashMap.empty<string, HashSet.HashSet<string>>(),
        outputHash: "output",
      };
      const fs = FileSystem.makeNoop({
        readFile: () => Effect.succeed(new Uint8Array([1, 2])),
      });
      const hashing = Crypto.make({
        randomBytes: (size) => new Uint8Array(size),
        digest: (_algorithm, contents) => Effect.succeed(contents),
      });
      expect(yield* WatchBuild.verifyInputs(captured, fs, hashing)).toBe(true);
      expect(
        yield* WatchBuild.verifyInputs(
          captured,
          FileSystem.makeNoop({
            readFile: () => Effect.succeed(new Uint8Array([3])),
          }),
          hashing,
        ),
      ).toBe(false);
      expect(captured.fingerprints).toEqual(HashMap.make(["input.ts", "0102"]));
    }),
);

it.effect.each(["read", "digest"] as const)(
  "retains the structured %s failure during input verification",
  (operation) =>
    Effect.gen(function* () {
      const cause = PlatformError.badArgument({
        module: "FileSystem",
        method: "readFile",
        description: "unavailable",
      });
      const captured = {
        ...successfulOutcome.snapshot,
        fingerprints: HashMap.make(["input.ts", "0102"]),
      };
      const verified = yield* WatchBuild.verifyInputs(
        captured,
        FileSystem.makeNoop({
          readFile: () =>
            operation === "read"
              ? Effect.fail(cause)
              : Effect.succeed(new Uint8Array([1, 2])),
        }),
        Crypto.make({
          randomBytes: (size) => new Uint8Array(size),
          digest: () => Effect.fail(cause),
        }),
      ).pipe(Effect.result);
      assert(Result.isFailure(verified));
      expect(verified.failure).toEqual(
        WatchBuild.Failure.InputCaptureFailed({ file: "input.ts", cause }),
      );
    }),
);

it("recognizes a joined request after its earlier observer was canceled", () => {
  const id = WatchBuild.makeRequestId();
  const requested = WatchBuild.request(WatchBuild.initialProgress, id);
  const ended = WatchBuild.endRequest(requested);
  const joined = WatchBuild.request(ended, id);
  expect(WatchBuild.joinedWithoutCompletion(joined)).toBe(true);
  expect(WatchBuild.getCompletion(joined)).toEqual(Option.none());
  expect(WatchBuild.joinedWithoutCompletion(request(ended))).toBe(false);
  const completed = WatchBuild.complete(joined, {
    generation: joined.generation,
    outcome: successfulOutcome,
  });
  expect(WatchBuild.joinedWithoutCompletion(completed)).toBe(false);
  expect(WatchBuild.getCompletion(completed)._tag).toBe("Some");
});

it("requires a completion from beyond the refresh barrier, not just a newer start", () => {
  const started = WatchBuild.start(WatchBuild.initialProgress);
  const barrier = WatchBuild.captureBarrier(started);
  const requested = request(started);
  const stale = {
    generation: started.generation,
    outcome: successfulOutcome,
  };
  const completed = WatchBuild.complete(requested, stale);
  const newer = WatchBuild.start(completed);
  expect(WatchBuild.getCompletion(newer)).toEqual(Option.some(stale));
  expect(WatchBuild.isFresh(barrier, stale)).toBe(false);
  const fresh = {
    generation: newer.generation,
    outcome: successfulOutcome,
  };
  expect(WatchBuild.getCompletion(WatchBuild.complete(newer, fresh))).toEqual(
    Option.some(stale),
  );
  const retried = request(WatchBuild.endRequest(newer));
  expect(WatchBuild.getCompletion(WatchBuild.complete(retried, fresh))).toEqual(
    Option.some(fresh),
  );
  expect(WatchBuild.isFresh(barrier, fresh)).toBe(true);
  expect(WatchBuild.getCompletion(requested)).toEqual(Option.none());
  expect(WatchBuild.getCompletion(started)).toEqual(Option.none());
  expect(WatchBuild.captureBarrier(started)).toBe(barrier);
});

it("does not retain unrelated completions after ending a request or across contexts", () => {
  const requested = request(WatchBuild.start(WatchBuild.initialProgress));
  const completion = {
    generation: requested.generation,
    outcome: successfulOutcome,
  };
  const ended = WatchBuild.endRequest(requested);
  expect(
    WatchBuild.getCompletion(WatchBuild.complete(ended, completion)),
  ).toEqual(Option.none());
  expect(WatchBuild.getCompletion(WatchBuild.initialProgress)).toEqual(
    Option.none(),
  );
  const replacement = WatchBuild.start(request(WatchBuild.initialProgress));
  const fresh = { ...completion, generation: replacement.generation };
  expect(
    WatchBuild.isFresh(
      WatchBuild.captureBarrier(WatchBuild.initialProgress),
      fresh,
    ),
  ).toBe(true);
  expect(
    WatchBuild.getCompletion(WatchBuild.complete(replacement, fresh)),
  ).toEqual(Option.some(fresh));
});

it("diffs transitive dependencies through both old and new graphs", () => {
  const oldGraph = HashMap.make(
    ["shared.ts", HashSet.make("old-helper.ts")],
    ["old-helper.ts", HashSet.make("old.impl.ts")],
  );
  const newGraph = HashMap.make(
    ["shared.ts", HashSet.make("new-helper.ts")],
    ["new-helper.ts", HashSet.make("new.impl.ts")],
  );
  const previous = snapshot(HashMap.make(["shared.ts", "before"]), oldGraph);
  const current = snapshot(HashMap.make(["shared.ts", "after"]), newGraph);
  const change = WatchBuild.diff(previous, current, "_generated/");
  assert(change._tag === "Affected");
  expect(change.paths).toEqual(
    HashSet.make(
      "shared.ts",
      "old-helper.ts",
      "old.impl.ts",
      "new-helper.ts",
      "new.impl.ts",
    ),
  );
  expect(WatchBuild.fingerprints(previous)).toEqual(
    HashMap.make(["shared.ts", "before"]),
  );
  expect(WatchBuild.lastSuccessful(previous)).toEqual(
    Option.some({
      fingerprints: HashMap.make(["shared.ts", "before"]),
      graph: oldGraph,
      outputHash: "output",
    }),
  );
});

it("ignores generated-file echoes but not similarly named source directories", () => {
  const previous = snapshot(
    HashMap.make(
      ["_generated/spec.ts", "before"],
      ["_generatedOther/source.ts", "source"],
    ),
  );
  const generatedOnly = snapshot(
    HashMap.make(
      ["_generated/spec.ts", "after"],
      ["_generatedOther/source.ts", "source"],
    ),
    HashMap.empty(),
    "new output",
  );
  expect(WatchBuild.diff(previous, generatedOnly, "_generated/")).toEqual(
    WatchBuild.Change.Affected({ paths: HashSet.empty() }),
  );
  const sourceEdit = snapshot(
    HashMap.make(
      ["_generated/spec.ts", "after"],
      ["_generatedOther/source.ts", "changed"],
    ),
  );
  expect(WatchBuild.diff(generatedOnly, sourceEdit, "_generated/")).toEqual(
    WatchBuild.Change.Affected({
      paths: HashSet.make("_generatedOther/source.ts"),
    }),
  );
});

it("requires full work for the first snapshot, untracked output changes, and failed source edits", () => {
  const previous = snapshot(HashMap.make(["source.ts", "before"]));
  expect(
    WatchBuild.diff(WatchBuild.State.Initial(), previous, "_generated/"),
  ).toEqual(WatchBuild.Change.Full());
  expect(
    WatchBuild.diff(
      previous,
      snapshot(WatchBuild.fingerprints(previous), HashMap.empty(), "changed"),
      "_generated/",
    ),
  ).toEqual(WatchBuild.Change.Full());
  const failed = WatchBuild.observe(
    previous,
    WatchBuild.Outcome.Failed({
      fingerprints: HashMap.empty(),
      failures: [
        WatchBuild.Failure.InvalidBuildResult({ missing: "metafile" }),
      ],
      warnings: [],
    }),
  );
  expect(WatchBuild.diff(previous, failed, "_generated/")).toEqual(
    WatchBuild.Change.Full(),
  );
  expect(WatchBuild.diff(failed, failed, "_generated/")).toEqual(
    WatchBuild.Change.Affected({ paths: HashSet.empty() }),
  );
});

it("reads diagnostics without exposing historical errors as current errors", () => {
  expect(WatchBuild.diagnostics(WatchBuild.State.Initial())).toEqual({
    errors: [],
    warnings: [],
  });
  const warning: esbuild.Message = {
    id: "",
    pluginName: "",
    text: "warning",
    location: null,
    notes: [],
    detail: undefined,
  };
  const failed = WatchBuild.observe(
    WatchBuild.State.Initial(),
    WatchBuild.Outcome.Failed({
      fingerprints: HashMap.empty(),
      failures: [
        WatchBuild.Failure.InvalidBuildResult({ missing: "metafile" }),
      ],
      warnings: [warning],
    }),
  );
  expect(WatchBuild.diagnostics(failed).errors[0]?.text).toBe(
    "esbuild completed without metafile",
  );
  expect(WatchBuild.diagnostics(failed).warnings).toEqual([warning]);
  expect(WatchBuild.diagnostics(snapshot(HashMap.empty()))).toEqual({
    errors: [],
    warnings: [],
  });
});

it.effect(
  "parses successful snapshots without changing the build result or captured inputs",
  () =>
    Effect.gen(function* () {
      const input = result();
      const capture = {
        fingerprints: HashMap.make(["input.ts", "source"]),
        failures: HashMap.empty<string, WatchBuild.Failure>(),
      };
      const outcome = yield* WatchBuild.parse(
        input,
        capture,
        (file) => file,
        crypto,
      );
      assert(outcome._tag === "Succeeded");
      expect(outcome.snapshot.fingerprints).toBe(capture.fingerprints);
      expect(outcome.snapshot.outputHash).toBe("0102");
      expect(input).toEqual(result());
      expect(HashMap.isEmpty(capture.failures)).toBe(true);
    }),
);

it.effect.each(["metafile", "outputFiles"] as const)(
  "does not represent missing %s as a successful empty snapshot",
  (field) =>
    Effect.gen(function* () {
      const input = result();
      delete input[field];
      const outcome = yield* WatchBuild.parse(
        input,
        WatchBuild.emptyCapture,
        (file) => file,
        crypto,
      );
      assert(outcome._tag === "Failed");
      expect(outcome.failures).toEqual([
        WatchBuild.Failure.InvalidBuildResult({ missing: field }),
      ]);
    }),
);

it.effect(
  "preserves the last successful graph separately from failed input observations",
  () =>
    Effect.gen(function* () {
      const outcome = yield* WatchBuild.parse(
        result(),
        WatchBuild.emptyCapture,
        (file) => file,
        crypto,
      );
      assert(outcome._tag === "Succeeded");
      const successful = WatchBuild.observe(
        WatchBuild.State.Initial(),
        outcome,
      );
      const changed = HashMap.make(["input.ts", "changed"]);
      const failure = WatchBuild.Outcome.Failed({
        fingerprints: changed,
        failures: [
          WatchBuild.Failure.InvalidBuildResult({ missing: "metafile" }),
        ],
        warnings: [],
      });
      const failed = WatchBuild.observe(successful, failure);
      assert(failed._tag === "Failed");
      expect(WatchBuild.lastSuccessful(failed)).toEqual(
        Option.some(outcome.snapshot),
      );
      expect(WatchBuild.fingerprints(failed)).toBe(changed);
      expect(WatchBuild.outputHash(failed)).toEqual(Option.none());
      expect(WatchBuild.observe(failed, outcome)._tag).toBe("Succeeded");
      expect(
        WatchBuild.observe(WatchBuild.State.Initial(), failure),
      ).toMatchObject({ _tag: "Failed", lastSuccessful: Option.none() });
    }),
);

it.effect(
  "retains input and output fingerprint failures instead of accepting the build",
  () =>
    Effect.gen(function* () {
      const cause = PlatformError.badArgument({
        module: "Crypto",
        method: "digest",
        description: "test failure",
      });
      const capturedFailure = WatchBuild.Failure.InputCaptureFailed({
        file: "input.ts",
        cause,
      });
      const capture = {
        fingerprints: HashMap.empty<string, string>(),
        failures: HashMap.make(["input.ts", capturedFailure]),
      };
      const inputFailure = yield* WatchBuild.parse(
        result(),
        capture,
        (file) => file,
        crypto,
      );
      assert(inputFailure._tag === "Failed");
      expect(inputFailure.failures).toEqual([capturedFailure]);
      expect(WatchBuild.messages(inputFailure)[0]?.text).toContain(
        "Could not fingerprint input input.ts",
      );
      const outputFailure = yield* WatchBuild.parse(
        result(),
        WatchBuild.emptyCapture,
        (file) => file,
        Crypto.make({
          randomBytes: (size) => new Uint8Array(size),
          digest: () => Effect.fail(cause),
        }),
      );
      assert(outputFailure._tag === "Failed");
      expect(outputFailure.failures).toEqual([
        WatchBuild.Failure.OutputCaptureFailed({ file: "out.js", cause }),
      ]);
    }),
);

it.effect("carries esbuild diagnostics as a failed observation", () =>
  Effect.gen(function* () {
    const input = result();
    const error: esbuild.Message = {
      id: "",
      pluginName: "",
      text: "broken import",
      location: null,
      notes: [],
      detail: undefined,
    };
    input.errors.push(error);
    const outcome = yield* WatchBuild.parse(
      input,
      WatchBuild.emptyCapture,
      (file) => file,
      crypto,
    );
    assert(outcome._tag === "Failed");
    expect(WatchBuild.messages(outcome)).toEqual([error]);
    expect(input.errors).toEqual([error]);
  }),
);
