import { assert, expect, it } from "@effect/vitest";
import * as DevState from "@confect/cli/DevState";
import { ImplModulePath } from "@confect/cli/ImplModulePath";
import * as HashSet from "effect/HashSet";
import * as Option from "effect/Option";

it.each(["notes.impl.ts", "groups/notes.impl.ts", "groups\\notes.impl.ts"])(
  "parses %s into an implementation entry",
  (relativePath) => {
    const parsed = DevState.parseEntry(relativePath);
    assert(Option.isSome(parsed));
    expect(parsed.value).toEqual(
      DevState.EntryKind.Impl({
        relativePath: ImplModulePath.make(relativePath),
      }),
    );
  },
);

it.each(["tables/notes.impl.ts", "tables\\notes.impl.ts"])(
  "classifies %s as a table rather than an implementation",
  (relativePath) => {
    expect(DevState.parseEntry(relativePath)).toEqual(
      Option.some(DevState.EntryKind.Table({ relativePath })),
    );
  },
);

it("keeps unrelated files out of the entry-point domain", () => {
  expect(DevState.parseEntry("helpers.ts")).toEqual(Option.none());
  expect(DevState.parseEntry("notes.impl.js")).toEqual(Option.none());
});

it("coalesces implementation work without mutating earlier requests", () => {
  const first = ImplModulePath.make("first.impl.ts");
  const second = ImplModulePath.make("second.impl.ts");
  const pending = DevState.add(DevState.empty, [
    DevState.EntryKind.Impl({ relativePath: first }),
  ]);
  const next = DevState.add(pending, [
    DevState.EntryKind.Impl({ relativePath: first }),
    DevState.EntryKind.Impl({ relativePath: second }),
  ]);
  assert(pending.work._tag === "Impls");
  assert(next.work._tag === "Impls");
  expect(pending.work.paths).toEqual([first]);
  expect(next.work.paths).toHaveLength(2);
  expect(next.work.paths).toEqual(expect.arrayContaining([first, second]));
  expect(DevState.empty.work._tag).toBe("None");
});

it("full work subsumes impl work but preserves independent optional cleanup", () => {
  const pending = DevState.add(DevState.empty, [
    DevState.EntryKind.Http({ relativePath: "http.ts" }),
    DevState.EntryKind.Impl({
      relativePath: ImplModulePath.make("notes.impl.ts"),
    }),
  ]);
  const full = DevState.add(pending, [
    DevState.EntryKind.Spec({ relativePath: "notes.spec.ts" }),
  ]);
  expect(full.work._tag).toBe("Full");
  expect(HashSet.has(full.optional, "Http")).toBe(true);
  expect(
    DevState.add(full, [
      DevState.EntryKind.Impl({
        relativePath: ImplModulePath.make("other.impl.ts"),
      }),
    ]).work._tag,
  ).toBe("Full");
  expect(pending.work._tag).toBe("Impls");
});

it("requires full generation until bootstrap or full-sync recovery succeeds", () => {
  expect(
    DevState.requiresFullSync(DevState.Phase.Bootstrapping(), DevState.empty),
  ).toBe(true);
  expect(
    DevState.requiresFullSync(DevState.Phase.NeedsFullSync(), DevState.empty),
  ).toBe(true);
  const incremental = DevState.Phase.Incremental({
    failedImpls: HashSet.empty(),
  });
  expect(DevState.requiresFullSync(incremental, DevState.empty)).toBe(false);
  expect(
    DevState.requiresFullSync(incremental, DevState.full(DevState.empty)),
  ).toBe(true);
});

it("revalidates failed implementations alongside new work", () => {
  const first = ImplModulePath.make("first.impl.ts");
  const second = ImplModulePath.make("second.impl.ts");
  const phase = DevState.Phase.Incremental({
    failedImpls: HashSet.make(first),
  });
  const pending = DevState.add(DevState.empty, [
    DevState.EntryKind.Impl({ relativePath: second }),
  ]);
  expect(DevState.implsToValidate(phase, pending)).toEqual(
    expect.arrayContaining([first, second]),
  );
  expect(DevState.implsToValidate(phase, DevState.empty)).toEqual([first]);
  expect(
    DevState.isDirty(
      DevState.add(DevState.empty, [
        DevState.EntryKind.Auth({ relativePath: "auth.ts" }),
      ]),
    ),
  ).toBe(true);
});
