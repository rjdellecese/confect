import * as OutputPlan from "@confect/cli/OutputPlan";
import { assert, expect, it } from "@effect/vitest";
import * as Result from "effect/Result";

const registry = OutputPlan.Target.Registry({ relativePath: "notes.ts" });
const module = OutputPlan.Target.ConvexModule({ relativePath: "notes.ts" });
const write = OutputPlan.Operation.Write({
  target: registry,
  contents: "registry",
});

it.each(["schema.ts", "http.ts", "crons.ts", "auth.config.ts"] as const)(
  "claims the fixed Convex binding %s separately from function modules",
  (relativePath) => {
    const target = OutputPlan.Target.ConvexBinding({ relativePath });
    const operation = OutputPlan.Operation.Write({
      target,
      contents: "binding",
    });
    expect(Result.isSuccess(OutputPlan.make([operation]))).toBe(true);
    expect(
      Result.isFailure(
        OutputPlan.make([operation, OutputPlan.Operation.Remove({ target })]),
      ),
    ).toBe(true);
    expect(
      Result.isFailure(
        OutputPlan.make([
          OutputPlan.Operation.Remove({
            target: OutputPlan.Target.ConvexModule({ relativePath }),
          }),
        ]),
      ),
    ).toBe(true);
  },
);

it.each([
  "convex.config.ts",
  "other.ts",
  "HTTP.ts",
  "nested/http.ts",
  "../http.ts",
])("rejects a forged fixed Convex binding %s", (relativePath) => {
  const result = OutputPlan.make([
    OutputPlan.Operation.Remove({
      target: OutputPlan.Target.ConvexBinding({
        relativePath: relativePath as "http.ts",
      }),
    }),
  ]);
  assert(Result.isFailure(result));
  expect(result.failure).toMatchObject({
    _tag: "OutputPlanError",
    namespace: "ConvexBinding",
    relativePath,
  });
});

it("rejects scoped duplicate and parent-child targets while keeping aggregate ownership separate", () => {
  const scoped = OutputPlan.Operation.Write({
    target: OutputPlan.Target.ScopedRef({ relativePath: "notes.ts" }),
    contents: "scoped",
  });
  const remove = OutputPlan.Operation.Remove({ target: scoped.target });
  const child = OutputPlan.Operation.Remove({
    target: OutputPlan.Target.ScopedRef({ relativePath: "notes.ts/child.ts" }),
  });
  for (const operations of [
    [scoped, scoped],
    [remove, remove],
    [scoped, remove],
    [scoped, child],
    [child, scoped],
  ]) {
    const plan = OutputPlan.make(operations);
    assert(Result.isFailure(plan));
    expect(plan.failure).toMatchObject({
      namespace: "ScopedRef",
      reason: "ConflictingTarget",
    });
  }
  const desired = [
    scoped,
    OutputPlan.Operation.Write({
      target: OutputPlan.Target.Binding({ relativePath: "refs.ts" }),
      contents: "aggregate",
    }),
  ];
  const obsolete = OutputPlan.Target.ScopedRef({ relativePath: "refs.ts" });
  const result = OutputPlan.diff(desired, [scoped.target, obsolete]);
  assert(Result.isSuccess(result));
  expect(result.success.operations).toEqual([
    ...desired,
    OutputPlan.Operation.Remove({ target: obsolete }),
  ]);
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
    OutputPlan.Target.TableWrapper({ relativePath }),
    OutputPlan.Target.ScopedRef({ relativePath }),
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
  "id.ts",
  "schema.ts",
  "convexSchema.ts",
  "docs.ts",
  "services.ts",
  "spec.ts",
  "refs.ts",
  "components.ts",
] as const)(
  "accepts only the fixed binding %s and rejects conflicting operations",
  (relativePath) => {
    const target = OutputPlan.Target.Binding({ relativePath });
    const bindingWrite = OutputPlan.Operation.Write({
      target,
      contents: relativePath,
    });
    const remove = OutputPlan.Operation.Remove({ target });
    const plan = OutputPlan.make([bindingWrite]);
    assert(Result.isSuccess(plan));
    expect(plan.success.operations).toEqual([bindingWrite]);
    for (const operations of [
      [bindingWrite, bindingWrite],
      [remove, remove],
      [bindingWrite, remove],
    ]) {
      const conflict = OutputPlan.make(operations);
      assert(Result.isFailure(conflict));
      expect(conflict.failure.reason).toBe("ConflictingTarget");
    }
  },
);

it.each([
  "other.ts",
  "api.ts",
  "ID.ts",
  "nested/id.ts",
  "../id.ts",
  "/id.ts",
  "id.js",
])("rejects a forged runtime binding %s", (relativePath) => {
  const target = OutputPlan.Target.Binding({
    relativePath: relativePath as "id.ts",
  });
  const plan = OutputPlan.make([OutputPlan.Operation.Remove({ target })]);
  assert(Result.isFailure(plan));
  expect(plan.failure).toMatchObject({
    _tag: "OutputPlanError",
    namespace: "Binding",
    relativePath,
  });
});

it("keeps table and binding ownership separate and rejects table conflicts", () => {
  const table = OutputPlan.Target.TableWrapper({ relativePath: "schema.ts" });
  const binding = OutputPlan.Target.Binding({ relativePath: "schema.ts" });
  const tableWrite = OutputPlan.Operation.Write({
    target: table,
    contents: "table",
  });
  const remove = OutputPlan.Operation.Remove({ target: table });
  const child = OutputPlan.Operation.Remove({
    target: OutputPlan.Target.TableWrapper({
      relativePath: "schema.ts/child.ts",
    }),
  });
  for (const operations of [
    [tableWrite, tableWrite],
    [remove, remove],
    [tableWrite, remove],
    [tableWrite, child],
    [child, tableWrite],
  ]) {
    const plan = OutputPlan.make(operations);
    assert(Result.isFailure(plan));
    expect(plan.failure.reason).toBe("ConflictingTarget");
  }
  const desired = [
    tableWrite,
    OutputPlan.Operation.Write({ target: binding, contents: "binding" }),
  ];
  const obsolete = OutputPlan.Target.TableWrapper({ relativePath: "old.ts" });
  const result = OutputPlan.diff(desired, [table, obsolete]);
  assert(Result.isSuccess(result));
  expect(result.success.operations).toEqual([
    ...desired,
    OutputPlan.Operation.Remove({ target: obsolete }),
  ]);
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
