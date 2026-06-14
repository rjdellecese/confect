import { describe, expect, it } from "@effect/vitest";
import * as MutableRef from "effect/MutableRef";
import * as Schema from "effect/Schema";
import * as FunctionSpec from "@confect/core/FunctionSpec";
import * as Ref from "@confect/core/Ref";

describe("isFunctionSpec", () => {
  it("checks whether a value is a function spec", () => {
    const functionSpec: unknown = FunctionSpec.publicQuery({
      name: "myFunction",
      args: () => Schema.Struct({}),
      returns: () => Schema.String,
    });

    expect(FunctionSpec.isFunctionSpec(functionSpec)).toStrictEqual(true);
  });
});

describe("make", () => {
  it("disallows invalid JS identifiers as function names", () => {
    expect(() =>
      FunctionSpec.publicQuery({
        name: "123",
        args: () => Schema.Struct({}),
        returns: () => Schema.String,
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Expected a valid Confect function identifier, but received: "123". Valid identifiers must start with a letter, underscore, or dollar sign, and can only contain letters, numbers, underscores, or dollar signs.]`,
    );
  });

  it("disallows reserved keywords as function names", () => {
    expect(() =>
      FunctionSpec.publicQuery({
        name: "if",
        args: () => Schema.Struct({}),
        returns: () => Schema.String,
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Expected a valid Confect function identifier, but received: "if". "if" is a reserved JavaScript identifier.]`,
    );
  });

  it("disallows reserved Convex file names as function names", () => {
    expect(() =>
      FunctionSpec.publicQuery({
        name: "schema",
        args: () => Schema.Struct({}),
        returns: () => Schema.String,
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Expected a valid Confect function identifier, but received: "schema". "schema" is a reserved Convex file name.]`,
    );
  });
});

// LAZINESS INVARIANT — DO NOT REGRESS.
//
// `args`/`returns`/`error` are passed as `() => Schema` thunks and exposed as
// lazy memoised getters so that importing the assembled `_generated/spec.ts`
// (which transitively references every function in the project) does not build
// any schemas at module load. The cold-start win depends on two rules:
//
//   1. Constructing a `FunctionSpec` must NOT evaluate any schema thunk.
//   2. Code that only needs to know WHETHER an `error` schema exists must use a
//      key-presence check (`"error" in functionProvenance`) rather than reading
//      `.error`, which would force-build the schema. See `Ref.hasErrorSchema`.
//
// If you are changing `FunctionProvenance`, `FunctionSpec`, or `Ref` and these
// tests fail, do not "fix" them by eagerly reading the schemas — preserve the
// laziness instead.
describe("laziness invariant", () => {
  const makeSpec = (track: {
    args?: () => void;
    returns?: () => void;
    error?: () => void;
  }) =>
    FunctionSpec.publicQuery({
      name: "tracked",
      args: () => {
        track.args?.();
        return Schema.Struct({});
      },
      returns: () => {
        track.returns?.();
        return Schema.Null;
      },
      error: () => {
        track.error?.();
        return Schema.String;
      },
    });

  it("constructing a FunctionSpec does not evaluate any schema thunk", () => {
    const argsBuilt = MutableRef.make(false);
    const returnsBuilt = MutableRef.make(false);
    const errorBuilt = MutableRef.make(false);

    makeSpec({
      args: () => MutableRef.set(argsBuilt, true),
      returns: () => MutableRef.set(returnsBuilt, true),
      error: () => MutableRef.set(errorBuilt, true),
    });

    expect(MutableRef.get(argsBuilt)).toBe(false);
    expect(MutableRef.get(returnsBuilt)).toBe(false);
    expect(MutableRef.get(errorBuilt)).toBe(false);
  });

  it("Ref.hasErrorSchema checks presence without forcing the error thunk", () => {
    const errorBuilt = MutableRef.make(false);
    const spec = makeSpec({
      error: () => MutableRef.set(errorBuilt, true),
    });
    const ref = Ref.make("ns", spec);

    expect(Ref.hasErrorSchema(ref)).toBe(true);
    expect(MutableRef.get(errorBuilt)).toBe(false);
  });

  it("a spec without an error schema reports no error without defining the key", () => {
    const spec = FunctionSpec.publicQuery({
      name: "noError",
      args: () => Schema.Struct({}),
      returns: () => Schema.Null,
    });
    const ref = Ref.make("ns", spec);

    expect(Ref.hasErrorSchema(ref)).toBe(false);
    expect("error" in spec.functionProvenance).toBe(false);
  });

  it("accessing a schema getter forces the thunk exactly once and memoises", () => {
    const argsCalls = MutableRef.make(0);
    const spec = makeSpec({
      args: () => MutableRef.increment(argsCalls),
    });

    const first = spec.functionProvenance.args;
    const second = spec.functionProvenance.args;

    expect(MutableRef.get(argsCalls)).toBe(1);
    expect(second).toBe(first);
  });
});
