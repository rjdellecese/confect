import { describe, expect, test } from "@effect/vitest";
import { v } from "convex/values";
import { Schema } from "effect";

import {
  compileTableValidator,
  compileValidator,
} from "../src/ValidatorToSchema";

const decode = <A, I>(schema: Schema.Schema<A, I, never>, value: unknown) =>
  Schema.decodeUnknownSync(schema)(value);

describe(compileValidator, () => {
  test("any", () => {
    const schema = compileValidator(v.any());
    expect(decode(schema, "hello")).toBe("hello");
    expect(decode(schema, 42)).toBe(42);
    expect(decode(schema, null)).toBeNull();
  });

  test("string", () => {
    const schema = compileValidator(v.string());
    expect(decode(schema, "hello")).toBe("hello");
    expect(() => decode(schema, 42)).toThrow();
  });

  test("float64", () => {
    const schema = compileValidator(v.float64());
    expect(decode(schema, 3.14)).toBe(3.14);
    expect(() => decode(schema, "nope")).toThrow();
  });

  test("int64", () => {
    const schema = compileValidator(v.int64());
    expect(decode(schema, 7n)).toBe(7n);
    expect(() => decode(schema, 7)).toThrow();
  });

  test("boolean", () => {
    const schema = compileValidator(v.boolean());
    expect(decode(schema, true)).toBe(true);
    expect(() => decode(schema, "true")).toThrow();
  });

  test("null", () => {
    const schema = compileValidator(v.null());
    expect(decode(schema, null)).toBeNull();
    expect(() => decode(schema, undefined)).toThrow();
  });

  test("bytes", () => {
    const schema = compileValidator(v.bytes());
    const buf = new ArrayBuffer(8);
    expect(decode(schema, buf)).toBe(buf);
    expect(() => decode(schema, "not bytes")).toThrow();
  });

  test("id", () => {
    const schema = compileValidator(v.id("users"));
    expect(decode(schema, "abc123")).toBe("abc123");
    expect(() => decode(schema, 123)).toThrow();
  });

  test("string literal", () => {
    const schema = compileValidator(v.literal("LiteralString"));
    expect(decode(schema, "LiteralString")).toBe("LiteralString");
    expect(() => decode(schema, "Other")).toThrow();
  });

  test("number literal", () => {
    const schema = compileValidator(v.literal(42));
    expect(decode(schema, 42)).toBe(42);
    expect(() => decode(schema, 43)).toThrow();
  });

  test("boolean literal", () => {
    const schema = compileValidator(v.literal(true));
    expect(decode(schema, true)).toBe(true);
    expect(() => decode(schema, false)).toThrow();
  });

  test("bigint literal", () => {
    const schema = compileValidator(v.literal(1n));
    expect(decode(schema, 1n)).toBe(1n);
    expect(() => decode(schema, 2n)).toThrow();
  });

  test("empty object", () => {
    const schema = compileValidator(v.object({}));
    expect(decode(schema, {})).toStrictEqual({});
  });

  test("simple object", () => {
    const schema = compileValidator(
      v.object({ foo: v.string(), bar: v.float64() }),
    );
    expect(decode(schema, { foo: "hi", bar: 1.5 })).toStrictEqual({
      foo: "hi",
      bar: 1.5,
    });
    expect(() => decode(schema, { foo: "hi" })).toThrow();
  });

  test("object with optional field", () => {
    const schema = compileValidator(v.object({ foo: v.optional(v.string()) }));
    expect(decode(schema, { foo: "hi" })).toStrictEqual({ foo: "hi" });
    expect(decode(schema, {})).toStrictEqual({});
  });

  test("nested objects", () => {
    const schema = compileValidator(
      v.object({ foo: v.object({ bar: v.object({ baz: v.string() }) }) }),
    );
    expect(decode(schema, { foo: { bar: { baz: "x" } } })).toStrictEqual({
      foo: { bar: { baz: "x" } },
    });
  });

  test("object with optional nested object", () => {
    const schema = compileValidator(
      v.object({
        foo: v.optional(v.object({ bar: v.optional(v.float64()) })),
      }),
    );
    expect(decode(schema, {})).toStrictEqual({});
    expect(decode(schema, { foo: { bar: 1.5 } })).toStrictEqual({
      foo: { bar: 1.5 },
    });
    expect(decode(schema, { foo: {} })).toStrictEqual({ foo: {} });
  });

  test("object with optional id field", () => {
    const schema = compileValidator(
      v.object({ userId: v.optional(v.id("users")) }),
    );
    expect(decode(schema, {})).toStrictEqual({});
    expect(decode(schema, { userId: "abc" })).toStrictEqual({
      userId: "abc",
    });
  });

  test("array", () => {
    const schema = compileValidator(v.array(v.string()));
    expect(decode(schema, ["a", "b"])).toStrictEqual(["a", "b"]);
    expect(() => decode(schema, [1])).toThrow();
  });

  test("nested array", () => {
    const schema = compileValidator(v.array(v.array(v.string())));
    expect(decode(schema, [["a"], ["b", "c"]])).toStrictEqual([
      ["a"],
      ["b", "c"],
    ]);
  });

  test("array of union", () => {
    const schema = compileValidator(v.array(v.union(v.string(), v.float64())));
    expect(decode(schema, ["a", 1.5])).toStrictEqual(["a", 1.5]);
  });

  test("union", () => {
    const schema = compileValidator(v.union(v.string(), v.float64()));
    expect(decode(schema, "hello")).toBe("hello");
    expect(decode(schema, 3.14)).toBe(3.14);
    expect(() => decode(schema, true)).toThrow();
  });

  test("four element union", () => {
    const schema = compileValidator(
      v.union(v.string(), v.float64(), v.boolean(), v.object({})),
    );
    expect(decode(schema, "hi")).toBe("hi");
    expect(decode(schema, 1)).toBe(1);
    expect(decode(schema, true)).toBe(true);
    expect(decode(schema, {})).toStrictEqual({});
    expect(() => decode(schema, null)).toThrow();
  });

  test("literal union", () => {
    const schema = compileValidator(
      v.union(v.literal("admin"), v.literal("user")),
    );
    expect(decode(schema, "admin")).toBe("admin");
    expect(decode(schema, "user")).toBe("user");
    expect(() => decode(schema, "other")).toThrow();
  });

  test("object union", () => {
    const schema = compileValidator(
      v.union(v.object({ foo: v.string() }), v.object({ bar: v.float64() })),
    );
    expect(decode(schema, { foo: "hi" })).toStrictEqual({ foo: "hi" });
    expect(decode(schema, { bar: 1.5 })).toStrictEqual({ bar: 1.5 });
  });

  test("record", () => {
    const schema = compileValidator(v.record(v.string(), v.float64()));
    expect(decode(schema, { a: 1, b: 2 })).toStrictEqual({ a: 1, b: 2 });
    expect(() => decode(schema, { a: "nope" })).toThrow();
  });

  test("complex nested structure", () => {
    const schema = compileValidator(
      v.object({
        name: v.string(),
        age: v.float64(),
        active: v.boolean(),
        score: v.int64(),
        avatar: v.bytes(),
        deletedAt: v.union(v.string(), v.null()),
        tags: v.array(v.string()),
        address: v.object({
          street: v.string(),
          city: v.string(),
          zip: v.float64(),
        }),
        notes: v.optional(v.string()),
        role: v.union(v.literal("admin"), v.literal("user")),
      }),
    );

    const value = {
      name: "Alice",
      age: 30,
      active: true,
      score: 100n,
      avatar: new ArrayBuffer(4),
      deletedAt: null,
      tags: ["a", "b"],
      address: { street: "123 Main", city: "Townsville", zip: 12345 },
      role: "admin" as const,
    };

    expect(decode(schema, value)).toStrictEqual(value);
  });
});

describe(compileTableValidator, () => {
  test("succeeds for object validator", () => {
    const schema = compileTableValidator(
      v.object({
        foo: v.string(),
        bar: v.optional(v.object({ baz: v.float64() })),
      }),
    );
    expect(decode(schema, { foo: "hi" })).toStrictEqual({ foo: "hi" });
    expect(decode(schema, { foo: "hi", bar: { baz: 1 } })).toStrictEqual({
      foo: "hi",
      bar: { baz: 1 },
    });
  });

  test("succeeds for object with optional id", () => {
    const schema = compileTableValidator(
      v.object({
        text: v.string(),
        userId: v.optional(v.id("users")),
      }),
    );
    expect(decode(schema, { text: "hi" })).toStrictEqual({ text: "hi" });
    expect(decode(schema, { text: "hi", userId: "abc" })).toStrictEqual({
      text: "hi",
      userId: "abc",
    });
  });

  test("succeeds for union validator", () => {
    const schema = compileTableValidator(v.union(v.string(), v.float64()));
    expect(decode(schema, "hello")).toBe("hello");
    expect(decode(schema, 3.14)).toBe(3.14);
  });
});
