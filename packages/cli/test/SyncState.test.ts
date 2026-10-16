import { assert, expect, it } from "@effect/vitest";
import * as SyncState from "@confect/cli/SyncState";
import * as EntryPoint from "@confect/cli/EntryPoint";
import { ImplModulePath } from "@confect/cli/ImplModulePath";
import * as HashSet from "effect/HashSet";
import * as GenerationSnapshot from "@confect/cli/GenerationSnapshot";
import * as Result from "effect/Result";
import { SpecModulePath } from "@confect/cli/SpecModulePath";
import { TableModulePath } from "@confect/cli/TableModulePath";

it("requires deployment notification only for bootstrap and recovery", () => {
  const snapshot = Result.getOrThrow(GenerationSnapshot.fromLoadedLeaves([]));
  expect(
    SyncState.needsDeploymentNotification(SyncState.Phase.Bootstrapping()),
  ).toBe(true);
  expect(
    SyncState.needsDeploymentNotification(SyncState.Phase.NeedsFullSync()),
  ).toBe(true);
  expect(
    SyncState.needsDeploymentNotification(
      SyncState.Phase.Incremental({
        snapshot,
        failedImpls: HashSet.make(ImplModulePath.make("notes.impl.ts")),
      }),
    ),
  ).toBe(true);
  expect(
    SyncState.needsDeploymentNotification(
      SyncState.transition(SyncState.Outcome.Succeeded({ snapshot })),
    ),
  ).toBe(false);
});

it("transitions successful operations to incremental work with no failed implementations", () => {
  const snapshot = Result.getOrThrow(GenerationSnapshot.fromLoadedLeaves([]));
  const next = SyncState.transition(SyncState.Outcome.Succeeded({ snapshot }));
  assert(SyncState.Phase.$is("Incremental")(next));
  expect(next.snapshot).toBe(snapshot);
  expect(HashSet.isEmpty(next.failedImpls)).toBe(true);
});

it("preserves snapshot and failed paths after implementation validation fails", () => {
  const snapshot = Result.getOrThrow(GenerationSnapshot.fromLoadedLeaves([]));
  const first = ImplModulePath.make("first.impl.ts");
  const second = ImplModulePath.make("second.impl.ts");
  const next = SyncState.transition(
    SyncState.Outcome.ValidationFailed({
      snapshot,
      paths: [first, second],
    }),
  );
  assert(SyncState.Phase.$is("Incremental")(next));
  expect(next.snapshot).toBe(snapshot);
  expect(next.failedImpls).toEqual(HashSet.make(first, second));
});

it.each([
  SyncState.Outcome.GenerationFailed(),
  SyncState.Outcome.ReconciliationFailed(),
])("requires full synchronization after $_tag", (outcome) => {
  expect(SyncState.transition(outcome)).toEqual(
    SyncState.Phase.NeedsFullSync(),
  );
});

it("automatically retries only failed bootstrap generation", () => {
  const snapshot = Result.getOrThrow(GenerationSnapshot.fromLoadedLeaves([]));
  const outcomes = [
    SyncState.Outcome.Succeeded({ snapshot }),
    SyncState.Outcome.ReconciliationFailed(),
    SyncState.Outcome.ValidationFailed({
      snapshot,
      paths: [ImplModulePath.make("notes.impl.ts")],
    }),
  ];
  const bootstrapping = SyncState.Phase.Bootstrapping();
  expect(
    SyncState.shouldRetry(bootstrapping, SyncState.Outcome.GenerationFailed()),
  ).toBe(true);
  for (const outcome of outcomes) {
    expect(SyncState.shouldRetry(bootstrapping, outcome)).toBe(false);
  }
  for (const phase of [
    SyncState.Phase.NeedsFullSync(),
    SyncState.Phase.Incremental({ snapshot, failedImpls: HashSet.empty() }),
  ]) {
    for (const outcome of [...outcomes, SyncState.Outcome.GenerationFailed()]) {
      expect(SyncState.shouldRetry(phase, outcome)).toBe(false);
    }
  }
});

it.each([EntryPoint.Kind.Config()])(
  "requests full generation for $_tag entries",
  (entry) => {
    const optional = SyncState.add(SyncState.empty, [
      EntryPoint.Kind.Http({ relativePath: "http.ts" }),
      EntryPoint.Kind.Crons({ relativePath: "crons.ts" }),
      EntryPoint.Kind.Auth({ relativePath: "auth.ts" }),
    ]);
    const pending = SyncState.add(optional, [entry]);
    expect(pending.work._tag).toBe("Full");
    expect(pending.optional).toEqual(HashSet.make("Http", "Crons", "Auth"));
    expect(optional.work._tag).toBe("None");
    expect(SyncState.isDirty(optional)).toBe(true);
    expect(SyncState.isDirty(SyncState.empty)).toBe(false);
  },
);

it("coalesces implementation work without mutating earlier requests", () => {
  const first = ImplModulePath.make("first.impl.ts");
  const second = ImplModulePath.make("second.impl.ts");
  const pending = SyncState.add(SyncState.empty, [
    EntryPoint.Kind.Impl({ relativePath: first }),
  ]);
  const next = SyncState.add(pending, [
    EntryPoint.Kind.Impl({ relativePath: first }),
    EntryPoint.Kind.Impl({ relativePath: second }),
  ]);
  assert(pending.work._tag === "Impls");
  assert(next.work._tag === "Impls");
  expect(pending.work.paths).toEqual([first]);
  expect(next.work.paths).toHaveLength(2);
  expect(next.work.paths).toEqual(expect.arrayContaining([first, second]));
  expect(SyncState.empty.work._tag).toBe("None");
});

it("reconciles recovered observations without losing required generation or failed implementations", () => {
  const pending = SyncState.reconcile(SyncState.empty);
  expect(pending.work._tag).toBe("Reconcile");
  expect(SyncState.isDirty(pending)).toBe(true);
  expect(SyncState.add(pending, [])).toEqual(pending);
  expect(SyncState.empty.work._tag).toBe("None");
  for (const phase of [
    SyncState.Phase.Bootstrapping(),
    SyncState.Phase.NeedsFullSync(),
  ])
    expect(SyncState.plan(phase, pending)._tag).toBe("Generate");
  const snapshot = Result.getOrThrow(GenerationSnapshot.fromLoadedLeaves([]));
  const phase = SyncState.Phase.Incremental({
    snapshot,
    failedImpls: HashSet.empty(),
  });
  expect(SyncState.plan(phase, pending)).toEqual(
    SyncState.Operation.Validate({ snapshot, paths: [] }),
  );
  const failed = ImplModulePath.make("failed.impl.ts");
  expect(
    SyncState.implsToValidate(
      SyncState.Phase.Incremental({
        snapshot,
        failedImpls: HashSet.make(failed),
      }),
      pending,
    ),
  ).toEqual([failed]);
  for (const work of [
    SyncState.full(SyncState.empty),
    SyncState.add(SyncState.empty, [
      EntryPoint.Kind.Impl({ relativePath: failed }),
    ]),
    SyncState.add(SyncState.empty, [
      EntryPoint.Kind.Spec({
        relativePath: SpecModulePath.make("notes.spec.ts"),
      }),
    ]),
  ]) {
    expect(SyncState.reconcile(work)).toEqual(work);
  }
  const optional = EntryPoint.Kind.Http({ relativePath: "http.ts" });
  expect(SyncState.add(pending, [optional]).work._tag).toBe("Reconcile");
  expect(HashSet.has(SyncState.add(pending, [optional]).optional, "Http")).toBe(
    true,
  );
  expect(
    SyncState.add(pending, [EntryPoint.Kind.Impl({ relativePath: failed })])
      .work._tag,
  ).toBe("Impls");
});

it("full work subsumes impl work but preserves independent optional cleanup", () => {
  const pending = SyncState.add(SyncState.empty, [
    EntryPoint.Kind.Http({ relativePath: "http.ts" }),
    EntryPoint.Kind.Impl({
      relativePath: ImplModulePath.make("notes.impl.ts"),
    }),
  ]);
  const full = SyncState.add(pending, [EntryPoint.Kind.Config()]);
  expect(full.work._tag).toBe("Full");
  expect(HashSet.has(full.optional, "Http")).toBe(true);
  expect(
    SyncState.add(full, [
      EntryPoint.Kind.Impl({
        relativePath: ImplModulePath.make("other.impl.ts"),
      }),
    ]).work._tag,
  ).toBe("Full");
  expect(pending.work._tag).toBe("Impls");
});

it("requires full generation until bootstrap or full-sync recovery succeeds", () => {
  expect(
    SyncState.Operation.$is("Generate")(
      SyncState.plan(SyncState.Phase.Bootstrapping(), SyncState.empty),
    ),
  ).toBe(true);
  expect(
    SyncState.Operation.$is("Generate")(
      SyncState.plan(SyncState.Phase.NeedsFullSync(), SyncState.empty),
    ),
  ).toBe(true);
  const incremental = SyncState.Phase.Incremental({
    failedImpls: HashSet.empty(),
    snapshot: Result.getOrThrow(GenerationSnapshot.fromLoadedLeaves([])),
  });
  expect(SyncState.plan(incremental, SyncState.empty)._tag).toBe("Validate");
  expect(
    SyncState.Operation.$is("Generate")(
      SyncState.plan(incremental, SyncState.full(SyncState.empty)),
    ),
  ).toBe(true);
});

it("revalidates failed implementations alongside new work", () => {
  const first = ImplModulePath.make("first.impl.ts");
  const second = ImplModulePath.make("second.impl.ts");
  const phase = SyncState.Phase.Incremental({
    failedImpls: HashSet.make(first),
    snapshot: Result.getOrThrow(GenerationSnapshot.fromLoadedLeaves([])),
  });
  const pending = SyncState.add(SyncState.empty, [
    EntryPoint.Kind.Impl({ relativePath: second }),
  ]);
  expect(SyncState.implsToValidate(phase, pending)).toEqual(
    expect.arrayContaining([first, second]),
  );
  expect(SyncState.implsToValidate(phase, SyncState.empty)).toEqual([first]);
  expect(
    SyncState.isDirty(
      SyncState.add(SyncState.empty, [
        EntryPoint.Kind.Auth({ relativePath: "auth.ts" }),
      ]),
    ),
  ).toBe(true);
});

it("coalesces dependency-aware declarations and impls without mutating previous work", () => {
  const spec = EntryPoint.Kind.Spec({
    relativePath: SpecModulePath.make("notes.spec.ts"),
  });
  const table = EntryPoint.Kind.Table({
    relativePath: TableModulePath.make("tables/notes.ts"),
  });
  const impl = ImplModulePath.make("notes.impl.ts");
  const first = SyncState.add(SyncState.empty, [spec]);
  const pending = SyncState.add(first, [
    spec,
    table,
    EntryPoint.Kind.Impl({ relativePath: impl }),
    EntryPoint.Kind.Http({ relativePath: "http.ts" }),
  ]);
  assert(SyncState.Work.$is("Declarations")(first.work));
  assert(SyncState.Work.$is("Declarations")(pending.work));
  expect(first.work.entries).toEqual([spec]);
  expect(pending.work.entries).toHaveLength(2);
  expect(pending.work.entries).toEqual(expect.arrayContaining([spec, table]));
  expect(pending.work.paths).toEqual([impl]);
  expect(HashSet.has(pending.optional, "Http")).toBe(true);
  const ready = SyncState.Phase.Incremental({
    failedImpls: HashSet.empty(),
    snapshot: Result.getOrThrow(GenerationSnapshot.fromLoadedLeaves([])),
  });
  const operation = SyncState.plan(ready, pending);
  assert(SyncState.Operation.$is("Update")(operation));
  expect(operation.declarations).toEqual(pending.work.entries);
  expect(operation.snapshot).toBe(ready.snapshot);
  expect(operation.paths).toEqual([impl]);
  expect(SyncState.implsToValidate(ready, pending)).toEqual([impl]);
  expect(SyncState.full(pending).work._tag).toBe("Full");
  expect(SyncState.add(SyncState.full(pending), [spec]).work._tag).toBe("Full");
  expect(SyncState.add(pending, [], true).work._tag).toBe("Full");
});
