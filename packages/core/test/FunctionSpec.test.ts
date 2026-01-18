import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as FunctionSpec from "../src/FunctionSpec";

describe("isFunctionSpec", () => {
  it("checks whether a value is a function spec", () => {
    const functionSpec: unknown = FunctionSpec.query({
      name: "myFunction",
      args: Schema.Struct({}),
      returns: Schema.String,
    });

    expect(FunctionSpec.isFunctionSpec(functionSpec)).toStrictEqual(true);
  });
});

describe("make", () => {
  it("disallows invalid JS identifiers as function names", () => {
    expect(() =>
      FunctionSpec.query({
        name: "123",
        args: Schema.Struct({}),
        returns: Schema.String,
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Expected a valid JavaScript identifier, but received: "123". Valid identifiers must start with a letter, underscore, or dollar sign, and can only contain letters, numbers, underscores, or dollar signs.]`,
    );
  });

  it("disallows reserved keywords as function names", () => {
    expect(() =>
      FunctionSpec.query({
        name: "if",
        args: Schema.Struct({}),
        returns: Schema.String,
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Expected a valid JavaScript identifier, but received: "if". "if" is a reserved keyword.]`,
    );
  });
});
