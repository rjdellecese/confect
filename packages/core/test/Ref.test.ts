import type {
  FunctionReference,
  FunctionVisibility,
  PaginationOptions as ConvexPaginationOptions,
  PaginationResult as ConvexPaginationResult,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import { ConvexError } from "convex/values";
import * as Effect from "effect/Effect";
import * as MutableRef from "effect/MutableRef";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, expectTypeOf, test } from "vitest";

import * as FunctionSpec from "@confect/core/FunctionSpec";
import * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import * as PaginationOptions from "@confect/core/PaginationOptions";
import * as PaginationResult from "@confect/core/PaginationResult";
import * as Ref from "@confect/core/Ref";

describe("FunctionReference", () => {
  test("public query", () => {
    type Ref_ = Ref.FromFunctionSpec<
      ReturnType<typeof FunctionSpec.publicQuery>
    >;
    expectTypeOf<Ref.FunctionReference<Ref_>>().toEqualTypeOf<
      FunctionReference<"query", "public">
    >();
  });

  test("internal query", () => {
    type Ref_ = Ref.FromFunctionSpec<
      ReturnType<typeof FunctionSpec.internalQuery>
    >;
    expectTypeOf<Ref.FunctionReference<Ref_>>().toEqualTypeOf<
      FunctionReference<"query", "internal">
    >();
  });

  test("public mutation", () => {
    type Ref_ = Ref.FromFunctionSpec<
      ReturnType<typeof FunctionSpec.publicMutation>
    >;
    expectTypeOf<Ref.FunctionReference<Ref_>>().toEqualTypeOf<
      FunctionReference<"mutation", "public">
    >();
  });

  test("internal mutation", () => {
    type Ref_ = Ref.FromFunctionSpec<
      ReturnType<typeof FunctionSpec.internalMutation>
    >;
    expectTypeOf<Ref.FunctionReference<Ref_>>().toEqualTypeOf<
      FunctionReference<"mutation", "internal">
    >();
  });

  test("public action", () => {
    type Ref_ = Ref.FromFunctionSpec<
      ReturnType<typeof FunctionSpec.publicAction>
    >;
    expectTypeOf<Ref.FunctionReference<Ref_>>().toEqualTypeOf<
      FunctionReference<"action", "public">
    >();
  });

  test("internal action", () => {
    type Ref_ = Ref.FromFunctionSpec<
      ReturnType<typeof FunctionSpec.internalAction>
    >;
    expectTypeOf<Ref.FunctionReference<Ref_>>().toEqualTypeOf<
      FunctionReference<"action", "internal">
    >();
  });

  test("public node action", () => {
    type Ref_ = Ref.FromFunctionSpec<
      ReturnType<typeof FunctionSpec.publicNodeAction>
    >;
    expectTypeOf<Ref.FunctionReference<Ref_>>().toEqualTypeOf<
      FunctionReference<"action", "public">
    >();
  });

  test("internal node action", () => {
    type Ref_ = Ref.FromFunctionSpec<
      ReturnType<typeof FunctionSpec.internalNodeAction>
    >;
    expectTypeOf<Ref.FunctionReference<Ref_>>().toEqualTypeOf<
      FunctionReference<"action", "internal">
    >();
  });

  test("preserves args and returns", () => {
    const _spec = FunctionSpec.publicQuery({
      name: "get",
      args: () => ({ id: Schema.String }),
      returns: () => Schema.Array(Schema.Finite),
    });
    type Ref_ = Ref.FromFunctionSpec<typeof _spec>;
    expectTypeOf<Ref.Args<Ref_>>().toEqualTypeOf<{ readonly id: string }>();
    expectTypeOf<Ref.ArgsFields<Ref_>>().toEqualTypeOf<{
      readonly id: typeof Schema.String;
    }>();
    expectTypeOf<Ref.ArgsSchema<Ref_>["fields"]>().toEqualTypeOf<
      Ref.ArgsFields<Ref_>
    >();
    expectTypeOf<Ref.Returns<Ref_>>().toEqualTypeOf<readonly number[]>();
    expectTypeOf<Ref.FunctionReference<Ref_>>().toEqualTypeOf<
      FunctionReference<"query", "public">
    >();
  });

  test("empty args", () => {
    const _spec = FunctionSpec.internalMutation({
      name: "reset",
      returns: () => Schema.Void,
    });
    type Ref_ = Ref.FromFunctionSpec<typeof _spec>;
    expectTypeOf<Ref.Args<Ref_>>().toEqualTypeOf<{}>();
    expectTypeOf<Ref.Returns<Ref_>>().toEqualTypeOf<void>();
  });

  test("AnyConfect", () => {
    expectTypeOf<Ref.Args<Ref.AnyConfect>>().toBeAny();
    expectTypeOf<Ref.Returns<Ref.AnyConfect>>().toBeAny();
    expectTypeOf<Ref.Error<Ref.AnyConfect>>().toBeAny();
    expectTypeOf<Ref.ArgsSchema<Ref.AnyConfect>>().toMatchTypeOf<
      Schema.Codec<any, any>
    >();
  });

  test("AnyQuery", () => {
    expectTypeOf<Ref.FunctionReference<Ref.AnyQuery>>().toEqualTypeOf<
      FunctionReference<"query", FunctionVisibility>
    >();
  });

  test("AnyMutation", () => {
    expectTypeOf<Ref.FunctionReference<Ref.AnyMutation>>().toEqualTypeOf<
      FunctionReference<"mutation", FunctionVisibility>
    >();
  });

  test("AnyAction", () => {
    expectTypeOf<Ref.FunctionReference<Ref.AnyAction>>().toEqualTypeOf<
      FunctionReference<"action", FunctionVisibility>
    >();
  });
});

describe("OptionalArgs", () => {
  test("optional tuple when args are empty", () => {
    const _spec = FunctionSpec.publicQuery({
      name: "list",
      returns: () => Schema.Void,
    });
    type Ref_ = Ref.FromFunctionSpec<typeof _spec>;
    expectTypeOf<Ref.OptionalArgs<Ref_>>().toEqualTypeOf<[args?: {}]>();
  });

  test("required tuple when args have keys", () => {
    const _spec = FunctionSpec.publicQuery({
      name: "get",
      args: () => ({ id: Schema.String }),
      returns: () => Schema.Void,
    });
    type Ref_ = Ref.FromFunctionSpec<typeof _spec>;
    expectTypeOf<Ref.OptionalArgs<Ref_>>().toEqualTypeOf<
      [args: { readonly id: string }]
    >();
  });
});

describe("getFunctionReference", () => {
  const ref = Ref.make(
    "notes",
    FunctionSpec.publicQuery({
      name: "list",
      returns: () => Schema.Void,
    }),
  );

  test("returns a reference for the ref's Convex function name", () => {
    expect(Ref.getFunctionReference(ref)).toBe(Ref.getFunctionReference(ref));
  });

  test("distinct function names produce distinct references", () => {
    const other = Ref.make(
      "notes",
      FunctionSpec.publicQuery({
        name: "get",
        returns: () => Schema.Void,
      }),
    );

    expect(Ref.getFunctionReference(ref)).not.toBe(
      Ref.getFunctionReference(other),
    );
  });
});

describe("Error type extraction", () => {
  test("no error schema means Error is never", () => {
    const _spec = FunctionSpec.publicMutation({
      name: "create",
      args: () => ({ name: Schema.String }),
      returns: () => Schema.Void,
    });
    type Ref_ = Ref.FromFunctionSpec<typeof _spec>;
    expectTypeOf<Ref.Error<Ref_>>().toEqualTypeOf<never>();
  });

  test("error schema extracts the error type", () => {
    class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
      id: Schema.String,
    }) {}

    const _spec = FunctionSpec.publicMutation({
      name: "update",
      args: () => ({ id: Schema.String }),
      returns: () => Schema.Void,
      error: () => NotFound,
    });
    type Ref_ = Ref.FromFunctionSpec<typeof _spec>;
    expectTypeOf<Ref.Error<Ref_>>().toEqualTypeOf<NotFound>();
  });

  test("union error schema extracts the union type", () => {
    class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
      id: Schema.String,
    }) {}
    class Forbidden extends Schema.TaggedError<Forbidden>()("Forbidden", {
      reason: Schema.String,
    }) {}

    const _spec = FunctionSpec.publicMutation({
      name: "remove",
      args: () => ({ id: Schema.String }),
      returns: () => Schema.Void,
      error: () => Schema.Union([NotFound, Forbidden]),
    });
    type Ref_ = Ref.FromFunctionSpec<typeof _spec>;
    expectTypeOf<Ref.Error<Ref_>>().toEqualTypeOf<NotFound | Forbidden>();
  });
});

describe("isConvexError", () => {
  test("returns true for ConvexError instances", () => {
    const error = new ConvexError({ code: "NOT_FOUND" });
    expect(Ref.isConvexError(error)).toBe(true);
  });

  test("returns false for plain errors", () => {
    expect(Ref.isConvexError(new Error("oops"))).toBe(false);
  });

  test("returns false for non-errors", () => {
    expect(Ref.isConvexError("string")).toBe(false);
    expect(Ref.isConvexError(null)).toBe(false);
    expect(Ref.isConvexError(undefined)).toBe(false);
  });
});

describe("decodeError", () => {
  test("decodes error data using the error schema", async () => {
    class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
      id: Schema.String,
    }) {}

    const spec = FunctionSpec.publicMutation({
      name: "update",
      returns: () => Schema.Void,
      error: () => NotFound,
    });
    const ref = Ref.make("test/mod", spec);

    const result = await Effect.runPromise(
      Ref.decodeError(ref, { _tag: "NotFound", id: "abc" }),
    );
    expect(Option.isSome(result)).toBe(true);
    const decoded = Option.getOrThrow(result);
    expect(decoded).toBeInstanceOf(NotFound);
    expect(decoded.id).toBe("abc");
  });

  test("returns None when the ref has no error schema", async () => {
    const spec = FunctionSpec.publicMutation({
      name: "create",
      returns: () => Schema.Void,
    });
    const ref = Ref.make("test/mod", spec);

    const result = await Effect.runPromise(
      Ref.decodeError(ref, { anything: "goes" }),
    );
    expect(Option.isNone(result)).toBe(true);
  });
});

describe("decodeErrorOption", () => {
  class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
    id: Schema.String,
  }) {}

  const refWithError = Ref.make(
    "test/mod",
    FunctionSpec.publicQuery({
      name: "getOrFail",
      returns: () => Schema.Void,
      error: () => NotFound,
    }),
  );

  test("decodes error data matching the error schema", () => {
    const decoded = Ref.decodeErrorOption(refWithError, {
      _tag: "NotFound",
      id: "abc",
    });

    expect(Option.isSome(decoded)).toBe(true);
    expect(Option.getOrThrow(decoded)).toBeInstanceOf(NotFound);
  });

  test("returns None — rather than throwing — for data that does not match", () => {
    // Convex raises its own `ConvexError`s (this is the shape of a pagination
    // `InvalidCursor`), which never match a user-declared error schema.
    // Throwing here would replace the real error with an opaque `ParseError`,
    // so callers could never surface the original.
    const decoded = Ref.decodeErrorOption(refWithError, {
      isConvexSystemError: true,
      paginationError: "InvalidCursor",
    });

    expect(Option.isNone(decoded)).toBe(true);
  });

  test("returns None when the ref has no error schema", () => {
    const ref = Ref.make(
      "test/mod",
      FunctionSpec.publicQuery({
        name: "get",
        returns: () => Schema.Void,
      }),
    );

    expect(
      Option.isNone(Ref.decodeErrorOption(ref, { anything: "goes" })),
    ).toBe(true);
  });
});

describe("decodeErrorOrElse", () => {
  class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
    id: Schema.String,
  }) {}

  const refWithSchema = Ref.make(
    "test/mod",
    FunctionSpec.publicMutation({
      name: "update",
      returns: () => Schema.Void,
      error: () => NotFound,
    }),
  );

  const refWithoutSchema = Ref.make(
    "test/mod",
    FunctionSpec.publicMutation({
      name: "create",
      returns: () => Schema.Void,
    }),
  );

  test("decodes a ConvexError into the typed error when the schema matches", () => {
    const handler = Ref.decodeErrorOrElse(refWithSchema, () => "FALLBACK");
    const decoded = handler(new ConvexError({ _tag: "NotFound", id: "abc" }));
    expect(decoded).toBeInstanceOf(NotFound);
    expect((decoded as NotFound).id).toBe("abc");
  });

  test("calls the fallback for a non-ConvexError input", () => {
    const handler = Ref.decodeErrorOrElse(
      refWithSchema,
      (e) => `wrapped:${String(e)}`,
    );
    const original = new Error("network down");
    expect(handler(original)).toBe(`wrapped:${String(original)}`);
  });

  test("calls the fallback with the original ConvexError when the ref has no error schema", () => {
    const calls = MutableRef.make<ReadonlyArray<unknown>>([]);
    const fallback = (error: unknown) => {
      MutableRef.update(calls, (prev) => [...prev, error]);
      return error;
    };
    const handler = Ref.decodeErrorOrElse(refWithoutSchema, fallback);
    const convexError = new ConvexError({ _tag: "Anything", id: "abc" });

    expect(handler(convexError)).toBe(convexError);
    expect(MutableRef.get(calls)).toEqual([convexError]);
  });
});

describe("hasErrorSchema", () => {
  test("returns true for Confect ref with an error schema", () => {
    class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
      id: Schema.String,
    }) {}

    const ref = Ref.make(
      "test/mod",
      FunctionSpec.publicMutation({
        name: "update",
        returns: () => Schema.Void,
        error: () => NotFound,
      }),
    );

    expect(Ref.hasErrorSchema(ref)).toBe(true);
  });

  test("returns false for Confect ref without an error schema", () => {
    const ref = Ref.make(
      "test/mod",
      FunctionSpec.publicMutation({
        name: "create",
        returns: () => Schema.Void,
      }),
    );

    expect(Ref.hasErrorSchema(ref)).toBe(false);
  });

  test("returns false for Convex-provenance ref", () => {
    const convexSpec =
      FunctionSpec.convexPublicMutation<
        RegisteredMutation<"public", Record<string, never>, null>
      >()("enqueue");
    const ref = Ref.make("workpool", convexSpec);

    expect(Ref.hasErrorSchema(ref)).toBe(false);
  });
});

describe("paginated queries", () => {
  const paginatedDoc = Schema.Struct({ value: Schema.FiniteFromString });

  const paginatedRef = Ref.make(
    "notes",
    FunctionSpec.publicPaginatedQuery({
      name: "listPaginated",
      args: () => ({ count: Schema.FiniteFromString }),
      item: () => paginatedDoc,
    }),
  );

  const convexPaginatedRef = Ref.make(
    "notes",
    FunctionSpec.convexPublicQuery<
      RegisteredQuery<
        "public",
        { paginationOpts: ConvexPaginationOptions },
        ConvexPaginationResult<{ value: number }>
      >
    >()("listPaginated"),
  );

  // A plain publicQuery that merely LOOKS paginated: it satisfies the
  // structural AnyPublicPaginatedQuery type, but carries no paginated
  // provenance, so the runtime helpers reject it.
  const handRolledRef = Ref.make(
    "notes",
    FunctionSpec.publicQuery({
      name: "listPaginated",
      args: () => ({
        count: Schema.FiniteFromString,
        paginationOpts: PaginationOptions.PaginationOptions,
      }),
      returns: () => PaginationResult.PaginationResult(paginatedDoc),
    }),
  );

  describe("AnyPublicPaginatedQuery", () => {
    test("is satisfied by a constructor-built paginated query ref", () => {
      expectTypeOf(paginatedRef).toExtend<Ref.AnyPublicPaginatedQuery>();
    });

    test("is satisfied by a paginated query ref with an error schema", () => {
      class PaginationFailed extends Schema.TaggedError<PaginationFailed>()(
        "PaginationFailed",
        {},
      ) {}

      const refWithError = Ref.make(
        "notes",
        FunctionSpec.publicPaginatedQuery({
          name: "listPaginatedOrFail",
          item: () => paginatedDoc,
          error: () => PaginationFailed,
        }),
      );

      expectTypeOf(refWithError).toExtend<Ref.AnyPublicPaginatedQuery>();
      expectTypeOf<
        Ref.Error<typeof refWithError>
      >().toEqualTypeOf<PaginationFailed>();
    });

    test("is satisfied by a Convex-provenance paginated query ref", () => {
      expectTypeOf(convexPaginatedRef).toExtend<Ref.AnyPublicPaginatedQuery>();
    });
  });

  describe("decodePaginationPageSync", () => {
    test("decodes a page via the ref's item schema", () => {
      const decoded = Ref.decodePaginationPageSync(paginatedRef, [
        { value: "1" },
        { value: "2" },
      ]);

      expect(decoded).toEqual([{ value: 1 }, { value: 2 }]);
    });

    test("throws a constructor-pointing error for a hand-rolled paginated ref", () => {
      expect(() =>
        Ref.decodePaginationPageSync(handRolledRef, [{ value: "1" }]),
      ).toThrow(/was not built with .*publicPaginatedQuery/);
    });

    test("passes the page through unchanged for a Convex-provenance ref", () => {
      const page = [{ value: 1 }];

      expect(Ref.decodePaginationPageSync(convexPaginatedRef, page)).toBe(page);
    });
  });

  describe("encodePaginatedQueryArgsSync", () => {
    test("encodes args via the user-args schema", () => {
      expect(
        Ref.encodePaginatedQueryArgsSync(paginatedRef, { count: 42 }),
      ).toEqual({ count: "42" });
    });

    test("drops a stray paginationOpts key instead of sending it", () => {
      const encoded = Ref.encodePaginatedQueryArgsSync(paginatedRef, {
        count: 42,
        paginationOpts: { numItems: 50, cursor: null },
      } as never);

      expect(encoded).toEqual({ count: "42" });
    });

    test("throws a constructor-pointing error for a hand-rolled paginated ref", () => {
      expect(() =>
        Ref.encodePaginatedQueryArgsSync(handRolledRef, { count: 42 }),
      ).toThrow(/was not built with .*publicPaginatedQuery/);
    });

    test("passes args through unchanged for a Convex-provenance ref", () => {
      const args = {};

      expect(Ref.encodePaginatedQueryArgsSync(convexPaginatedRef, args)).toBe(
        args,
      );
    });
  });
});

describe("ConvexRef", () => {
  test("carries no codec schemas or middleware surface", () => {
    expectTypeOf<
      Extract<
        keyof Ref.ConvexRef<any, any, any, any>,
        "args" | "returns" | "error" | "kind" | "middlewareSpecs"
      >
    >().toBeNever();
  });
});

describe("error schema laziness at decode time", () => {
  test("forces error schema thunks only when an error is decoded", () => {
    const specErrorBuilt = MutableRef.make(false);
    const middlewareErrorBuilt = MutableRef.make(false);

    class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {}) {}
    class Blocked extends Schema.TaggedError<Blocked>()("Blocked", {}) {}

    class Gate extends MiddlewareSpec.MiddlewareSpec<Gate>()("LazyDecodeGate", {
      functionTypes: { query: true, mutation: true, action: true },
      error: () => {
        MutableRef.set(middlewareErrorBuilt, true);
        return Blocked;
      },
    }) {}

    const ref = Ref.make(
      "test/mod",
      FunctionSpec.publicQuery({
        name: "get",
        returns: () => Schema.String,
        error: () => {
          MutableRef.set(specErrorBuilt, true);
          return NotFound;
        },
      }),
      [Gate],
    );

    Ref.encodeArgsSync(ref, {});
    Ref.decodeReturnsSync(ref, "value");

    expect(MutableRef.get(specErrorBuilt)).toBe(false);
    expect(MutableRef.get(middlewareErrorBuilt)).toBe(false);

    const decoded = Ref.decodeErrorOption(ref, { _tag: "Blocked" });

    expect(Option.isSome(decoded)).toBe(true);
    expect(MutableRef.get(specErrorBuilt)).toBe(true);
    expect(MutableRef.get(middlewareErrorBuilt)).toBe(true);
  });
});
