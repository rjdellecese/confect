import { assert, expect, it } from "@effect/vitest";
import * as SyncState from "@confect/cli/SyncState";
import * as EntryPoint from "@confect/cli/EntryPoint";
import { ImplModulePath } from "@confect/cli/ImplModulePath";
import * as HashSet from "effect/HashSet";

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
  const full = SyncState.add(pending, [
    EntryPoint.Kind.Spec({ relativePath: "notes.spec.ts" }),
  ]);
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
    SyncState.requiresFullSync(
      SyncState.Phase.Bootstrapping(),
      SyncState.empty,
    ),
  ).toBe(true);
  expect(
    SyncState.requiresFullSync(
      SyncState.Phase.NeedsFullSync(),
      SyncState.empty,
    ),
  ).toBe(true);
  const incremental = SyncState.Phase.Incremental({
    failedImpls: HashSet.empty(),
  });
  expect(SyncState.requiresFullSync(incremental, SyncState.empty)).toBe(false);
  expect(
    SyncState.requiresFullSync(incremental, SyncState.full(SyncState.empty)),
  ).toBe(true);
});

it("revalidates failed implementations alongside new work", () => {
  const first = ImplModulePath.make("first.impl.ts");
  const second = ImplModulePath.make("second.impl.ts");
  const phase = SyncState.Phase.Incremental({
    failedImpls: HashSet.make(first),
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
