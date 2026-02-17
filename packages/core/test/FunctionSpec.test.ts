import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as FunctionSpec from "../src/FunctionSpec";

describe("isFunctionSpec", () => {
  it("checks whether a value is a function spec", () => {
    const functionSpec: unknown = FunctionSpec.publicQuery({
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
      FunctionSpec.publicQuery({
        name: "123",
        args: Schema.Struct({}),
        returns: Schema.String,
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Expected a valid Confect function identifier, but received: "123". Valid identifiers must start with a letter, underscore, or dollar sign, and can only contain letters, numbers, underscores, or dollar signs.]`,
    );
  });

  it("disallows reserved keywords as function names", () => {
    expect(() =>
      FunctionSpec.publicQuery({
        name: "if",
        args: Schema.Struct({}),
        returns: Schema.String,
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Expected a valid Confect function identifier, but received: "if". "if" is a reserved JavaScript identifier.]`,
    );
  });

  it("disallows reserved Convex file names as function names", () => {
    expect(() =>
      FunctionSpec.publicQuery({
        name: "schema",
        args: Schema.Struct({}),
        returns: Schema.String,
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Expected a valid Confect function identifier, but received: "schema". "schema" is a reserved Convex file name.]`,
    );
  });
});
