import { expect, it } from "@effect/vitest";
import {
  catchAndLog,
  isCodegenError,
  renderCodegenError,
} from "@confect/cli/CodegenError";
import { SnapshotError } from "@confect/cli/SnapshotError";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";

it("recognizes and renders structured snapshot failures without dumping their cause", () => {
  const error = SnapshotError.make({
    reason: "NoncanonicalPath",
    relativePath: "notes.spec.ts",
    pathSegments: ["other"],
    cause: { detail: "unrendered-cause" },
  });
  expect(isCodegenError(error)).toBe(true);
  const rendered = renderCodegenError(error);
  expect(rendered).toContain(
    "Invalid generation metadata (NoncanonicalPath) for notes.spec.ts at other.",
  );
  expect(rendered).not.toContain("unrendered-cause");
});

it("renders malformed snapshot input without inventing a source location", () => {
  const error = SnapshotError.make({
    reason: "InvalidShape",
    relativePath: "",
    pathSegments: [],
  });
  const rendered = renderCodegenError(error);
  expect(rendered).toContain("Invalid generation metadata (InvalidShape).");
  expect(rendered).not.toContain(" for ");
  expect(rendered).not.toContain(" at ");
});

it.effect("recovers only modeled codegen failures", () =>
  Effect.gen(function* () {
    const codegenError = SnapshotError.make({
      reason: "InvalidShape",
      relativePath: "",
      pathSegments: [],
    });
    const otherError = { _tag: "OtherFailure" as const, detail: "unhandled" };
    const recovered: Effect.Effect<
      Option.Option<never>,
      typeof otherError
    > = catchAndLog(Effect.fail<SnapshotError | typeof otherError>(otherError));
    const actual = yield* recovered.pipe(Effect.exit);
    expect(actual).toEqual(Exit.fail(otherError));
    const actual2 = yield* codegenError.pipe(Effect.fail, catchAndLog);
    expect(actual2).toEqual(Option.none());
    const actual3 = yield* catchAndLog(Effect.succeed(42));
    expect(actual3).toEqual(Option.some(42));
    const actual4 = yield* catchAndLog(Effect.die(otherError)).pipe(
      Effect.exit,
    );
    expect(actual4).toEqual(Exit.die(otherError));
  }),
);
