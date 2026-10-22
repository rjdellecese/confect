import * as OutputPlan from "@confect/cli/OutputPlan";
import { assert, expect, it } from "@effect/vitest";
import * as Result from "effect/Result";

const registry = OutputPlan.Target.Registry({ relativePath: "notes.ts" });
const module = OutputPlan.Target.ConvexModule({ relativePath: "notes.ts" });
const write = OutputPlan.Operation.Write({
  target: registry,
  contents: "registry",
});

it("preserves desired bytes and immutable inputs across both namespaces", () => {
  const operations = [
    write,
    OutputPlan.Operation.Write({ target: module, contents: "module" }),
  ];
  const before = JSON.stringify(operations);
  const plan = OutputPlan.make(operations);
  assert(Result.isSuccess(plan));
  expect(plan.success.operations).toBe(operations);
  expect(JSON.stringify(operations)).toBe(before);
});

it.each([
  "",
  "notes.js",
  ".ts",
  "/notes.ts",
  "../notes.ts",
  "notes/../other.ts",
  "./notes.ts",
  "notes//other.ts",
  "notes\\other.ts",
  "C:/notes.ts",
  "notes\0.ts",
])("rejects noncanonical or unbounded target %j", (relativePath) => {
  for (const target of [
    OutputPlan.Target.Registry({ relativePath }),
    OutputPlan.Target.ConvexModule({ relativePath }),
  ]) {
    const plan = OutputPlan.make([OutputPlan.Operation.Remove({ target })]);
    assert(Result.isFailure(plan));
    expect(plan.failure).toMatchObject({
      _tag: "OutputPlanError",
      reason: "InvalidPath",
      relativePath,
    });
  }
});

it.each([
  "schema.ts",
  "nested/http.ts",
  "crons.ts",
  "auth.config.ts",
  "convex.config.ts",
  "_generated/api.ts",
  "nested/_generated/server.ts",
])("does not claim reserved Convex target %s", (relativePath) => {
  const plan = OutputPlan.make([
    OutputPlan.Operation.Remove({
      target: OutputPlan.Target.ConvexModule({ relativePath }),
    }),
  ]);
  assert(Result.isFailure(plan));
  expect(plan.failure.reason).toBe("ReservedPath");
  expect(
    Result.isSuccess(
      OutputPlan.make([
        OutputPlan.Operation.Remove({
          target: OutputPlan.Target.Registry({ relativePath }),
        }),
      ]),
    ),
  ).toBe(true);
});

it("rejects duplicate and conflicting writes, removals, and parent targets in either order", () => {
  const remove = OutputPlan.Operation.Remove({ target: registry });
  const child = OutputPlan.Operation.Write({
    target: OutputPlan.Target.Registry({ relativePath: "notes.ts/child.ts" }),
    contents: "child",
  });
  for (const operations of [
    [write, write],
    [remove, remove],
    [write, remove],
    [write, child],
    [child, write],
  ]) {
    const plan = OutputPlan.make(operations);
    assert(Result.isFailure(plan));
    expect(plan.failure.reason).toBe("ConflictingTarget");
  }
});

it("diffs only explicit ownership, keeping desired bytes without mutating observations", () => {
  const obsolete = OutputPlan.Target.Registry({
    relativePath: "nested/obsolete.ts",
  });
  const owned = [registry, obsolete, module];
  const desired = [write];
  const before = JSON.stringify({ owned, desired });
  const result = OutputPlan.diff(desired, owned);
  assert(Result.isSuccess(result));
  expect(result.success.operations).toEqual([
    write,
    OutputPlan.Operation.Remove({ target: obsolete }),
    OutputPlan.Operation.Remove({ target: module }),
  ]);
  expect(JSON.stringify({ owned, desired })).toBe(before);
  expect(Result.isFailure(OutputPlan.diff(desired, [registry, registry]))).toBe(
    true,
  );
  expect(Result.isFailure(OutputPlan.diff([write, write], owned))).toBe(true);
});
