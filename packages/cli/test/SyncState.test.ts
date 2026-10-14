import { assert, expect, it } from "@effect/vitest";
import * as SyncState from "@confect/cli/SyncState";
import * as EntryPoint from "@confect/cli/EntryPoint";
import { ImplModulePath } from "@confect/cli/ImplModulePath";
import * as HashSet from "effect/HashSet";
import * as GenerationSnapshot from "@confect/cli/GenerationSnapshot";

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
    snapshot: GenerationSnapshot.fromLoadedLeaves([]),
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
    snapshot: GenerationSnapshot.fromLoadedLeaves([]),
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
  const spec = EntryPoint.Kind.Spec({ relativePath: "notes.spec.ts" });
  const table = EntryPoint.Kind.Table({ relativePath: "tables/notes.ts" });
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
    snapshot: GenerationSnapshot.fromLoadedLeaves([]),
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
