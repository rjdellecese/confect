import { Effect } from "effect";
import { describe, expect, test } from "vitest";
import {
  forEachBranchLeaves,
  setNestedProperty,
} from "../../src/internal/utils";

describe("setNestedProperty", () => {
  describe("single-level path", () => {
    test("sets a top-level property", () => {
      const obj = { a: 1, b: 2 };
      const result = setNestedProperty(obj, ["a"], 10);

      expect(result).toEqual({ a: 10, b: 2 });
    });

    test("does not mutate the original object", () => {
      const obj = { a: 1, b: 2 };
      const original = { ...obj };
      setNestedProperty(obj, ["a"], 10);

      expect(obj).toEqual(original);
    });

    test("preserves other properties", () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = setNestedProperty(obj, ["b"], 20);

      expect(result).toEqual({ a: 1, b: 20, c: 3 });
    });
  });

  describe("two-level path", () => {
    test("sets a nested property", () => {
      const obj = { a: { x: 1, y: 2 }, b: 3 };
      const result = setNestedProperty(obj, ["a", "x"], 10);

      expect(result).toEqual({ a: { x: 10, y: 2 }, b: 3 });
    });

    test("does not mutate the original object or nested objects", () => {
      const obj = { a: { x: 1, y: 2 }, b: 3 };
      const originalA = obj.a;
      const result = setNestedProperty(obj, ["a", "x"], 10);

      expect(obj.a).toBe(originalA); // Reference unchanged
      expect(obj.a.x).toBe(1); // Value unchanged
      expect(result.a).not.toBe(originalA); // New reference
    });

    test("preserves sibling properties at both levels", () => {
      const obj = { a: { x: 1, y: 2, z: 3 }, b: 4, c: 5 };
      const result = setNestedProperty(obj, ["a", "y"], 20);

      expect(result).toEqual({ a: { x: 1, y: 20, z: 3 }, b: 4, c: 5 });
    });
  });

  describe("three-level path", () => {
    test("sets a deeply nested property", () => {
      const obj = { a: { b: { c: 1, d: 2 }, e: 3 }, f: 4 };
      const result = setNestedProperty(obj, ["a", "b", "c"], 10);

      expect(result).toEqual({ a: { b: { c: 10, d: 2 }, e: 3 }, f: 4 });
    });

    test("maintains immutability at all levels", () => {
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
    test("handles empty objects at intermediate levels", () => {
      const obj = { a: {}, b: 2 };
      const result = setNestedProperty(obj, ["a", "x"], 10);

      expect(result).toEqual({ a: { x: 10 }, b: 2 });
    });

    test("works with various value types", () => {
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
    test("processes leaves at a single branch", async () => {
      const obj = {
        branch: {
          leaf1: "value1",
          leaf2: "value2",
        },
      };

      const results: Array<{ path: string[]; values: Record<string, string> }> =
        [];

      await Effect.runPromise(
        forEachBranchLeaves(obj, isString, ({ path, values }) =>
          Effect.sync(() => {
            results.push({ path, values });
          }),
        ),
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        path: ["branch"],
        values: { leaf1: "value1", leaf2: "value2" },
      });
    });

    test("processes leaves at multiple branches", async () => {
      const obj = {
        branch1: {
          leaf1: "a",
          leaf2: "b",
        },
        branch2: {
          leaf3: "c",
          leaf4: "d",
        },
      };

      const results: Array<{ path: string[]; values: Record<string, string> }> =
        [];

      await Effect.runPromise(
        forEachBranchLeaves(obj, isString, ({ path, values }) =>
          Effect.sync(() => {
            results.push({ path, values });
          }),
        ),
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
    });

    test("handles deeply nested branches", async () => {
      const obj = {
        level1: {
          level2: {
            leaf1: "deep",
            leaf2: "value",
          },
        },
      };

      const results: Array<{ path: string[]; values: Record<string, string> }> =
        [];

      await Effect.runPromise(
        forEachBranchLeaves(obj, isString, ({ path, values }) =>
          Effect.sync(() => {
            results.push({ path, values });
          }),
        ),
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        path: ["level1", "level2"],
        values: { leaf1: "deep", leaf2: "value" },
      });
    });
  });

  describe("filtering with refinement", () => {
    test("only processes values matching the refinement", async () => {
      const isNumber = (value: unknown): value is number =>
        typeof value === "number";

      const obj = {
        branch: {
          num1: 42,
          str: "ignored",
          num2: 100,
        },
      };

      const results: Array<{ path: string[]; values: Record<string, number> }> =
        [];

      await Effect.runPromise(
        forEachBranchLeaves(obj, isNumber, ({ path, values }) =>
          Effect.sync(() => {
            results.push({ path, values: values as Record<string, number> });
          }),
        ),
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        path: ["branch"],
        values: { num1: 42, num2: 100 },
      });
      // "str" should not be in values
      expect(results[0]!.values).not.toHaveProperty("str");
    });
  });

  describe("edge cases", () => {
    test("handles empty objects", async () => {
      const obj = {};

      const results: Array<{ path: string[]; values: Record<string, string> }> =
        [];

      await Effect.runPromise(
        forEachBranchLeaves(obj, isString, ({ path, values }) =>
          Effect.sync(() => {
            results.push({ path, values });
          }),
        ),
      );

      expect(results).toHaveLength(0);
    });

    test("handles objects with no matching leaves", async () => {
      const obj = {
        branch: {
          nested: {
            deep: {},
          },
        },
      };

      const results: Array<{ path: string[]; values: Record<string, string> }> =
        [];

      await Effect.runPromise(
        forEachBranchLeaves(obj, isString, ({ path, values }) =>
          Effect.sync(() => {
            results.push({ path, values: values as Record<string, string> });
          }),
        ),
      );

      expect(results).toHaveLength(0);
    });

    test("handles branches with mixed leaf and non-leaf values", async () => {
      const obj = {
        branch: {
          leaf: "value",
          nested: {
            deepLeaf: "deep",
          },
        },
      };

      const results: Array<{ path: string[]; values: Record<string, string> }> =
        [];

      await Effect.runPromise(
        forEachBranchLeaves(obj, isString, ({ path, values }) =>
          Effect.sync(() => {
            results.push({ path, values });
          }),
        ),
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
    });
  });

  describe("effect execution", () => {
    test("executes effects for all branches", async () => {
      const obj = {
        a: { x: "1" },
        b: { y: "2" },
        c: { z: "3" },
      };

      let count = 0;

      await Effect.runPromise(
        forEachBranchLeaves(obj, isString, () =>
          Effect.sync(() => {
            count++;
          }),
        ),
      );

      expect(count).toBe(3);
    });

    test("handles effect errors", async () => {
      const obj = {
        branch: {
          leaf: "value",
        },
      };

      const effect = forEachBranchLeaves(obj, isString, () =>
        Effect.fail("test error"),
      );

      await expect(Effect.runPromise(effect)).rejects.toThrow("test error");
    });

    test("returns Effect<void>", async () => {
      const obj = {
        branch: {
          leaf: "value",
        },
      };

      const result = await Effect.runPromise(
        forEachBranchLeaves(obj, isString, () => Effect.void),
      );

      expect(result).toBeUndefined();
    });
  });
});
