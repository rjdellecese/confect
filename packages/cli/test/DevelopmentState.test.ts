import { describe, expect, it } from "@effect/vitest";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as DevelopmentState from "@confect/cli/DevelopmentState";
import type { Revision } from "@confect/cli/CompilationState";
import type { EntryPoint } from "@confect/cli/EntryPoint";
import { SpecModulePath } from "@confect/cli/SpecModulePath";
import { ImplModulePath } from "@confect/cli/ImplModulePath";
import { TableModulePath } from "@confect/cli/TableModulePath";

describe("implementation inventory adoption", () => {
  const spec: EntryPoint = {
    _tag: "Spec",
    relativePath: SpecModulePath.make("notes.spec.ts"),
    absolutePath: "/project/notes.spec.ts",
    inputPath: "/project/notes.spec.ts",
  };
  const impl: EntryPoint = {
    _tag: "Impl",
    relativePath: ImplModulePath.make("notes.impl.ts"),
    absolutePath: "/project/notes.impl.ts",
    inputPath: "/project/notes.impl.ts",
  };
  const consumed = [
    { context: 1, revision: 2, roots: [impl.inputPath] },
  ] as const;
  const topology = [
    {
      id: 1,
      profile: "modules" as const,
      configuration: undefined,
      roots: [spec.inputPath, impl.inputPath],
    },
  ] as const;

  it("retains only newly added implementations consumed by an active module context", () => {
    expect(
      DevelopmentState.onlyConsumedImplsAdded(
        [spec],
        [spec, impl],
        consumed,
        topology,
      ),
    ).toBe(true);
    expect(
      DevelopmentState.onlyConsumedImplsAdded(
        [spec],
        [spec],
        consumed,
        topology,
      ),
    ).toBe(false);
    expect(
      DevelopmentState.onlyConsumedImplsAdded(
        [spec],
        [spec, impl],
        [],
        topology,
      ),
    ).toBe(false);
    expect(
      DevelopmentState.onlyConsumedImplsAdded(
        [spec],
        [spec, impl],
        consumed,
        [],
      ),
    ).toBe(false);
    expect(
      DevelopmentState.onlyConsumedImplsAdded([spec], [spec, impl], consumed, [
        { ...topology[0], profile: "component-config" },
      ]),
    ).toBe(false);
    expect(
      DevelopmentState.pendingRoots(
        DevelopmentState.acknowledge(DevelopmentState.empty, consumed),
        {
          context: 1,
          revision: 3,
          roots: [impl.inputPath],
          affectedRoots: [impl.inputPath],
          errors: [],
          warnings: [],
        },
      ),
    ).toEqual([impl.inputPath]);
  });

  it("requires full reconciliation for removals, retargeting, or uncovered implementations", () => {
    const other: EntryPoint = {
      ...impl,
      relativePath: ImplModulePath.make("other.impl.ts"),
      absolutePath: "/project/other.impl.ts",
      inputPath: "/project/other.impl.ts",
    };
    expect(
      DevelopmentState.onlyConsumedImplsAdded(
        [spec],
        [spec, impl, other],
        consumed,
        topology,
      ),
    ).toBe(false);
    expect(
      DevelopmentState.onlyConsumedImplsAdded(
        [spec],
        [impl, other],
        [{ ...consumed[0], roots: [impl.inputPath, other.inputPath] }],
        topology,
      ),
    ).toBe(false);
    expect(
      DevelopmentState.onlyConsumedImplsAdded(
        [spec],
        [{ ...spec, inputPath: "/retargeted/notes.spec.ts" }, impl],
        consumed,
        topology,
      ),
    ).toBe(false);
    expect(
      DevelopmentState.onlyConsumedImplsAdded(
        [spec],
        [spec, { ...impl, inputPath: "/retargeted/notes.impl.ts" }],
        [{ ...consumed[0], roots: ["/retargeted/notes.impl.ts"] }],
        topology,
      ),
    ).toBe(false);
  });

  it.each<EntryPoint>([
    {
      ...spec,
      relativePath: SpecModulePath.make("other.spec.ts"),
      absolutePath: "/project/other.spec.ts",
      inputPath: "/project/other.spec.ts",
    },
    {
      _tag: "Table",
      relativePath: TableModulePath.make("tables/other.ts"),
      absolutePath: "/project/tables/other.ts",
      inputPath: "/project/tables/other.ts",
    },
    {
      _tag: "Http",
      relativePath: "http.ts",
      absolutePath: "/project/http.ts",
      inputPath: "/project/http.ts",
    },
    {
      _tag: "Config",
      absolutePath: "/project/convex.config.ts",
      inputPath: "/project/convex.config.ts",
    },
  ])(
    "does not substitute receipts for $_tag output-topology reconciliation",
    (entry) => {
      expect(
        DevelopmentState.onlyConsumedImplsAdded(
          [spec],
          [spec, entry],
          [{ ...consumed[0], roots: [entry.inputPath] }],
          topology,
        ),
      ).toBe(false);
    },
  );
});

const revision = (version: number): Revision => ({
  context: 1,
  revision: version,
  roots: ["a", "b"],
  affectedRoots: ["a", "b"],
  errors: [],
  warnings: [],
});

it("acknowledges only covered roots and leaves later revisions pending", () => {
  const consumed = DevelopmentState.acknowledge(DevelopmentState.empty, [
    { context: 1, revision: 2, roots: ["a"] },
  ]);
  expect(DevelopmentState.pendingRoots(consumed, revision(1))).toEqual(["b"]);
  expect(DevelopmentState.pendingRoots(consumed, revision(2))).toEqual(["b"]);
  expect(DevelopmentState.pendingRoots(consumed, revision(3))).toEqual([
    "a",
    "b",
  ]);
  expect(HashMap.size(DevelopmentState.empty)).toBe(0);
});

it("does not regress watermarks when older receipts arrive", () => {
  const consumed = DevelopmentState.acknowledge(DevelopmentState.empty, [
    { context: 1, revision: 3, roots: ["a", "b"] },
  ]);
  const older = DevelopmentState.acknowledge(consumed, [
    { context: 1, revision: 1, roots: ["a"] },
  ]);
  expect(DevelopmentState.pendingRoots(older, revision(3))).toEqual([]);
  expect(DevelopmentState.pendingRoots(older, revision(4))).toEqual(["a", "b"]);
});

it("acknowledges failed shared attempts only for covered work", () => {
  const failed = [{ context: 1, revision: 2, roots: ["a"] }];
  const topology = [
    {
      id: 1,
      profile: "modules" as const,
      configuration: undefined,
      roots: ["a", "b"],
    },
  ];
  const partial = DevelopmentState.acknowledgeFailures(
    DevelopmentState.empty,
    failed,
    HashSet.make("a"),
    topology,
  );
  expect(DevelopmentState.pendingRoots(partial, revision(2))).toEqual(["b"]);
  const full = DevelopmentState.acknowledgeFailures(
    DevelopmentState.empty,
    failed,
    HashSet.make("a", "b"),
    topology,
  );
  expect(DevelopmentState.pendingRoots(full, revision(2))).toEqual([]);
  expect(DevelopmentState.pendingRoots(full, revision(3))).toEqual(["a", "b"]);
});

it("drops receipts for retired contexts without dropping active coverage", () => {
  const consumed = DevelopmentState.acknowledge(DevelopmentState.empty, [
    { context: 1, revision: 3, roots: ["a"] },
    { context: 2, revision: 4, roots: ["b"] },
  ]);
  const retained = DevelopmentState.retain(consumed, [
    { id: 2, profile: "modules", configuration: undefined, roots: ["b"] },
  ]);
  expect(HashMap.has(retained, 1)).toBe(false);
  expect(HashMap.has(retained, 2)).toBe(true);
  expect(HashMap.size(consumed)).toBe(2);
});
