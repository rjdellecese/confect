import { expect, it } from "@effect/vitest";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as DevelopmentState from "@confect/cli/DevelopmentState";
import type { Revision } from "@confect/cli/CompilationState";

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
