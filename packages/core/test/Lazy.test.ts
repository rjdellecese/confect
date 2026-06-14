import { describe, expect, test } from "vitest";
import * as Lazy from "@confect/core/Lazy";

describe("Lazy.defineProperty", () => {
  test("does not run compute until the property is first accessed", () => {
    const target = {} as { value: number };
    let calls = 0;
    Lazy.defineProperty(target, "value", () => {
      calls += 1;
      return 42;
    });

    expect(calls).toBe(0);
  });

  test("first access runs compute exactly once and returns its value", () => {
    const target = {} as { value: number };
    let calls = 0;
    Lazy.defineProperty(target, "value", () => {
      calls += 1;
      return 42;
    });

    expect(target.value).toBe(42);
    expect(calls).toBe(1);
  });

  test("second access returns the same reference without re-running compute", () => {
    const target = {} as { value: { id: number } };
    let calls = 0;
    Lazy.defineProperty(target, "value", () => {
      calls += 1;
      return { id: 1 };
    });

    const first = target.value;
    const second = target.value;

    expect(first).toBe(second);
    expect(calls).toBe(1);
  });

  test("computed property is enumerable after materialisation", () => {
    const target = {} as { value: number };
    Lazy.defineProperty(target, "value", () => 7);

    // Force materialisation.
    void target.value;

    expect(Object.keys(target)).toContain("value");
  });

  test("property is enumerable in the unforced (getter) state too", () => {
    const target = {} as { value: number };
    Lazy.defineProperty(target, "value", () => 7);

    expect(Object.keys(target)).toContain("value");
  });
});
