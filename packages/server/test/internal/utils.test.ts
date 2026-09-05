import type { Predicate } from "effect";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import {
  forEachBranchLeaves,
  setNestedProperty,
} from "../../src/internal/utils";

type NestedObject<T> = {
  readonly [key: string]: T | NestedObject<T>;
};

interface BranchLeaves<T> {
  readonly path: string[];
  readonly values: Record<string, T>;
}

const collectLeaves = Effect.fnUntraced(function* <T>(
  obj: NestedObject<T>,
  refinement: Predicate.Refinement<unknown, T>,
) {
  const results = yield* Ref.make<ReadonlyArray<BranchLeaves<T>>>([]);

  yield* forEachBranchLeaves(obj, refinement, (branch) =>
    Ref.update(results, (previous) => [...previous, branch]),
  );

  return yield* Ref.get(results);
});

describe("setNestedProperty", () => {
  describe("single-level path", () => {
    it("sets a top-level property", () => {
      const obj = { a: 1, b: 2 };
      const result = setNestedProperty(obj, ["a"], 10);

      expect(result).toEqual({ a: 10, b: 2 });
    });

    it("does not mutate the original object", () => {
      const obj = { a: 1, b: 2 };
      const original = { ...obj };
      setNestedProperty(obj, ["a"], 10);

      expect(obj).toEqual(original);
    });

    it("preserves other properties", () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = setNestedProperty(obj, ["b"], 20);

      expect(result).toEqual({ a: 1, b: 20, c: 3 });
    });
  });

  describe("two-level path", () => {
    it("sets a nested property", () => {
      const obj = { a: { x: 1, y: 2 }, b: 3 };
      const result = setNestedProperty(obj, ["a", "x"], 10);

      expect(result).toEqual({ a: { x: 10, y: 2 }, b: 3 });
    });

    it("does not mutate the original object or nested objects", () => {
      const obj = { a: { x: 1, y: 2 }, b: 3 };
      const originalA = obj.a;
      const result = setNestedProperty(obj, ["a", "x"], 10);

      expect(obj.a).toBe(originalA); // Reference unchanged
      expect(obj.a.x).toBe(1); // Value unchanged
      expect(result.a).not.toBe(originalA); // New reference
    });

    it("preserves sibling properties at both levels", () => {
      const obj = { a: { x: 1, y: 2, z: 3 }, b: 4, c: 5 };
      const result = setNestedProperty(obj, ["a", "y"], 20);

      expect(result).toEqual({ a: { x: 1, y: 20, z: 3 }, b: 4, c: 5 });
    });
  });

  describe("three-level path", () => {
    it("sets a deeply nested property", () => {
      const obj = { a: { b: { c: 1, d: 2 }, e: 3 }, f: 4 };
      const result = setNestedProperty(obj, ["a", "b", "c"], 10);

      expect(result).toEqual({ a: { b: { c: 10, d: 2 }, e: 3 }, f: 4 });
    });

    it("maintains immutability at all levels", () => {
      const obj = { a: { b: { c: 1 } } };
      const originalA = obj.a;
      const originalB = obj.a.b;
      const result = setNestedProperty(obj, ["a", "b", "c"], 10);

      expect(obj.a).toBe(originalA);
      expect(obj.a.b).toBe(originalB);
      expect(obj.a.b.c).toBe(1);
      expect(result.a.b.c).toBe(10);
    });
  });

  describe("edge cases", () => {
    it("handles empty objects at intermediate levels", () => {
      const obj = { a: {}, b: 2 };
      const result = setNestedProperty(obj, ["a", "x"], 10);

      expect(result).toEqual({ a: { x: 10 }, b: 2 });
    });

    it("works with various value types", () => {
      const obj = { a: { b: "old" } };

      const result1 = setNestedProperty(obj, ["a", "b"], "new");
      expect(result1).toEqual({ a: { b: "new" } });

      const result2 = setNestedProperty(obj, ["a", "b"], 42);
      expect(result2).toEqual({ a: { b: 42 } });

      const result3 = setNestedProperty(obj, ["a", "b"], null);
      expect(result3).toEqual({ a: { b: null } });

      const result4 = setNestedProperty(obj, ["a", "b"], { nested: "object" });
      expect(result4).toEqual({ a: { b: { nested: "object" } } });
    });
  });
});

describe("forEachBranchLeaves", () => {
  const isString = (value: unknown): value is string =>
    typeof value === "string";

  describe("basic functionality", () => {
    it.effect("processes leaves at a single branch", () =>
      Effect.gen(function* () {
        const results = yield* collectLeaves(
          {
            branch: {
              leaf1: "value1",
              leaf2: "value2",
            },
          },
          isString,
        );

        expect(results).toHaveLength(1);
        expect(results[0]).toEqual({
          path: ["branch"],
          values: { leaf1: "value1", leaf2: "value2" },
        });
      }),
    );

    it.effect("processes leaves at multiple branches", () =>
      Effect.gen(function* () {
        const results = yield* collectLeaves(
          {
            branch1: {
              leaf1: "a",
              leaf2: "b",
            },
            branch2: {
              leaf3: "c",
              leaf4: "d",
            },
          },
          isString,
        );

        expect(results).toHaveLength(2);
        expect(results).toContainEqual({
          path: ["branch1"],
          values: { leaf1: "a", leaf2: "b" },
        });
        expect(results).toContainEqual({
          path: ["branch2"],
          values: { leaf3: "c", leaf4: "d" },
        });
      }),
    );

    it.effect("handles deeply nested branches", () =>
      Effect.gen(function* () {
        const results = yield* collectLeaves(
          {
            level1: {
              level2: {
                leaf1: "deep",
                leaf2: "value",
              },
            },
          },
          isString,
        );

        expect(results).toHaveLength(1);
        expect(results[0]).toEqual({
          path: ["level1", "level2"],
          values: { leaf1: "deep", leaf2: "value" },
        });
      }),
    );
  });

  describe("filtering with refinement", () => {
    it.effect("only processes values matching the refinement", () =>
      Effect.gen(function* () {
        const isNumber = (value: unknown): value is number =>
          typeof value === "number";

        const results = yield* collectLeaves(
          {
            branch: {
              num1: 42,
              str: "ignored",
              num2: 100,
            },
          },
          isNumber,
        );

        expect(results).toHaveLength(1);
        expect(results[0]).toEqual({
          path: ["branch"],
          values: { num1: 42, num2: 100 },
        });
        expect(results[0]?.values).not.toHaveProperty("str");
      }),
    );
  });

  describe("edge cases", () => {
    it.effect("handles empty objects", () =>
      Effect.gen(function* () {
        const results = yield* collectLeaves({}, isString);

        expect(results).toHaveLength(0);
      }),
    );

    it.effect("handles objects with no matching leaves", () =>
      Effect.gen(function* () {
        const results = yield* collectLeaves(
          {
            branch: {
              nested: {
                deep: {},
              },
            },
          },
          isString,
        );

        expect(results).toHaveLength(0);
      }),
    );

    it.effect("handles branches with mixed leaf and non-leaf values", () =>
      Effect.gen(function* () {
        const results = yield* collectLeaves(
          {
            branch: {
              leaf: "value",
              nested: {
                deepLeaf: "deep",
              },
            },
          },
          isString,
        );

        expect(results).toHaveLength(2);
        expect(results).toContainEqual({
          path: ["branch"],
          values: { leaf: "value" },
        });
        expect(results).toContainEqual({
          path: ["branch", "nested"],
          values: { deepLeaf: "deep" },
        });
      }),
    );
  });

  describe("effect execution", () => {
    it.effect("executes effects for all branches", () =>
      Effect.gen(function* () {
        const count = yield* Ref.make(0);

        yield* forEachBranchLeaves(
          {
            a: { x: "1" },
            b: { y: "2" },
            c: { z: "3" },
          },
          isString,
          () => Ref.update(count, (value) => value + 1),
        );

        expect(yield* Ref.get(count)).toBe(3);
      }),
    );

    it.effect("handles effect errors", () =>
      Effect.gen(function* () {
        const effect = forEachBranchLeaves(
          {
            branch: {
              leaf: "value",
            },
          },
          isString,
          () => Effect.fail("test error"),
        );

        expect(yield* Effect.flip(effect)).toBe("test error");
      }),
    );

    it.effect("returns Effect<void>", () =>
      Effect.gen(function* () {
        const result = yield* forEachBranchLeaves(
          {
            branch: {
              leaf: "value",
            },
          },
          isString,
          () => Effect.void,
        );

        expect(result).toBeUndefined();
      }),
    );
  });
});
