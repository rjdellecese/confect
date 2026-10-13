import { assert, expect, it } from "@effect/vitest";
import * as WatchBuild from "@confect/cli/WatchBuild";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";
import type * as esbuild from "esbuild";

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

it("parses reported build rejections without confusing operation errors or malformed diagnostics", () => {
  expect(
    WatchBuild.parseFailure({ errors: [{ text: "syntax error" }] }),
  ).toEqual(Option.some({ errors: [{ text: "syntax error" }] }));
  expect(WatchBuild.parseFailure({ errors: [] })).toEqual(Option.none());
  expect(WatchBuild.parseFailure({ errors: ["invalid"] })).toEqual(
    Option.none(),
  );
  expect(WatchBuild.parseFailure(new Error("service stopped"))).toEqual(
    Option.none(),
  );
});
