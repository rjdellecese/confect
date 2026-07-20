import { describe, expect, it } from "@effect/vitest";
import { expectTypeOf } from "vitest";
import * as MutableRef from "effect/MutableRef";
import * as Schema from "effect/Schema";
import type * as FunctionProvenance from "@confect/core/FunctionProvenance";
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

describe("paginated queries", () => {
  const item = Schema.Struct({ value: Schema.NumberFromString });

  describe("laziness invariant", () => {
    const makePaginatedSpec = (track: {
      args?: () => void;
      item?: () => void;
      error?: () => void;
    }) =>
      FunctionSpec.publicPaginatedQuery({
        name: "tracked",
        args: () => {
          track.args?.();
          return Schema.Struct({});
        },
        item: () => {
          track.item?.();
          return item;
        },
        error: () => {
          track.error?.();
          return Schema.String;
        },
      });

    it("constructing a paginated FunctionSpec does not evaluate any schema thunk", () => {
      const argsBuilt = MutableRef.make(false);
      const itemBuilt = MutableRef.make(false);
      const errorBuilt = MutableRef.make(false);

      makePaginatedSpec({
        args: () => MutableRef.set(argsBuilt, true),
        item: () => MutableRef.set(itemBuilt, true),
        error: () => MutableRef.set(errorBuilt, true),
      });

      expect(MutableRef.get(argsBuilt)).toBe(false);
      expect(MutableRef.get(itemBuilt)).toBe(false);
      expect(MutableRef.get(errorBuilt)).toBe(false);
    });

    it("the kind tag is observable without forcing the schema thunks", () => {
      const argsBuilt = MutableRef.make(false);
      const itemBuilt = MutableRef.make(false);
      const spec = makePaginatedSpec({
        args: () => MutableRef.set(argsBuilt, true),
        item: () => MutableRef.set(itemBuilt, true),
      });

      expect(spec.functionProvenance.kind._tag).toBe("Paginated");
      expect(MutableRef.get(argsBuilt)).toBe(false);
      expect(MutableRef.get(itemBuilt)).toBe(false);
    });

    it("a standard spec's kind is Standard", () => {
      const spec = FunctionSpec.publicQuery({
        name: "list",
        args: () => Schema.Struct({}),
        returns: () => Schema.Null,
      });

      expect(spec.functionProvenance.kind._tag).toBe("Standard");
    });

    it("Ref.hasErrorSchema checks presence without forcing the error thunk", () => {
      const errorBuilt = MutableRef.make(false);
      const spec = makePaginatedSpec({
        error: () => MutableRef.set(errorBuilt, true),
      });
      const ref = Ref.make("ns", spec);

      expect(Ref.hasErrorSchema(ref)).toBe(true);
      expect(MutableRef.get(errorBuilt)).toBe(false);
    });

    it("accessing `args` forces the user-args thunk exactly once and memoises", () => {
      const argsCalls = MutableRef.make(0);
      const spec = makePaginatedSpec({
        args: () => MutableRef.increment(argsCalls),
      });

      const first = spec.functionProvenance.args;
      const second = spec.functionProvenance.args;

      expect(MutableRef.get(argsCalls)).toBe(1);
      expect(second).toBe(first);
    });
  });

  describe("composed schemas", () => {
    it("composes `paginationOpts` into the args schema", () => {
      const spec = FunctionSpec.publicPaginatedQuery({
        name: "listPaginated",
        args: () => Schema.Struct({ author: Schema.String }),
        item: () => item,
      });

      const args = spec.functionProvenance
        .args as unknown as FunctionProvenance.AnyUserArgs;
      expect(Object.keys(args.fields)).toEqual(["author", "paginationOpts"]);
    });

    it("defaults to paginationOpts-only args when `args` is omitted", () => {
      const spec = FunctionSpec.publicPaginatedQuery({
        name: "listPaginated",
        item: () => item,
      });

      const args = spec.functionProvenance
        .args as unknown as FunctionProvenance.AnyUserArgs;
      expect(Object.keys(args.fields)).toEqual(["paginationOpts"]);
    });

    it("composes the returns schema as a PaginationResult of the item", () => {
      const spec = FunctionSpec.publicPaginatedQuery({
        name: "listPaginated",
        item: () => item,
      });

      const returns = spec.functionProvenance
        .returns as unknown as FunctionProvenance.AnyUserArgs;
      expect(Object.keys(returns.fields)).toEqual([
        "page",
        "isDone",
        "continueCursor",
        "splitCursor",
        "pageStatus",
      ]);
    });

    it("throws when the user args schema declares paginationOpts", () => {
      const spec = FunctionSpec.publicPaginatedQuery({
        name: "listPaginated",
        // @ts-expect-error — paginationOpts must not be declared in user args
        args: () =>
          Schema.Struct({
            paginationOpts: Schema.Struct({ numItems: Schema.Number }),
          }),
        item: () => item,
      });

      expect(
        () => spec.functionProvenance.args,
      ).toThrowErrorMatchingInlineSnapshot(
        `[Error: A paginated query's args schema must not declare \`paginationOpts\` — it is added automatically from the \`PaginationOptions\` schema]`,
      );
    });
  });

  describe("types", () => {
    it("derives Args/Returns/Error from the composed schemas", () => {
      const _spec = FunctionSpec.publicPaginatedQuery({
        name: "listPaginated",
        args: () => Schema.Struct({ author: Schema.String }),
        item: () => item,
        error: () => Schema.String,
      });
      type Spec = typeof _spec;

      expectTypeOf<
        FunctionSpec.Args<Spec>["paginationOpts"]["numItems"]
      >().toEqualTypeOf<number>();
      expectTypeOf<FunctionSpec.Args<Spec>["author"]>().toEqualTypeOf<string>();
      expectTypeOf<FunctionSpec.Returns<Spec>["page"][number]>().toEqualTypeOf<{
        readonly value: number;
      }>();
      expectTypeOf<FunctionSpec.Error<Spec>>().toEqualTypeOf<string>();
      expectTypeOf<
        FunctionSpec.EncodedReturns<Spec>["page"][number]
      >().toEqualTypeOf<{ readonly value: string }>();
    });
  });
});
