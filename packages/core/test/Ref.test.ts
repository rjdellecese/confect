import type {
  FunctionReference,
  FunctionVisibility,
  RegisteredMutation,
} from "convex/server";
import { ConvexError } from "convex/values";
import { Effect, MutableRef, Option, Schema } from "effect";
import { describe, expect, expectTypeOf, test } from "vitest";

import * as FunctionSpec from "../src/FunctionSpec";
import * as Ref from "../src/Ref";

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
      args: Schema.Struct({ id: Schema.String }),
      returns: Schema.Array(Schema.Number),
    });
    type Ref_ = Ref.FromFunctionSpec<typeof _spec>;
    expectTypeOf<Ref.Args<Ref_>>().toEqualTypeOf<{ readonly id: string }>();
    expectTypeOf<Ref.Returns<Ref_>>().toEqualTypeOf<readonly number[]>();
    expectTypeOf<Ref.FunctionReference<Ref_>>().toEqualTypeOf<
      FunctionReference<"query", "public">
    >();
  });

  test("empty args", () => {
    const _spec = FunctionSpec.internalMutation({
      name: "reset",
      args: Schema.Struct({}),
      returns: Schema.Void,
    });
    type Ref_ = Ref.FromFunctionSpec<typeof _spec>;
    expectTypeOf<Ref.Args<Ref_>>().toEqualTypeOf<{}>();
    expectTypeOf<Ref.Returns<Ref_>>().toEqualTypeOf<void>();
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
      args: Schema.Struct({}),
      returns: Schema.Void,
    });
    type Ref_ = Ref.FromFunctionSpec<typeof _spec>;
    expectTypeOf<Ref.OptionalArgs<Ref_>>().toEqualTypeOf<[args?: {}]>();
  });

  test("required tuple when args have keys", () => {
    const _spec = FunctionSpec.publicQuery({
      name: "get",
      args: Schema.Struct({ id: Schema.String }),
      returns: Schema.Void,
    });
    type Ref_ = Ref.FromFunctionSpec<typeof _spec>;
    expectTypeOf<Ref.OptionalArgs<Ref_>>().toEqualTypeOf<
      [args: { readonly id: string }]
    >();
  });
});

describe("Error type extraction", () => {
  test("no error schema means Error is never", () => {
    const _spec = FunctionSpec.publicMutation({
      name: "create",
      args: Schema.Struct({ name: Schema.String }),
      returns: Schema.Void,
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
      args: Schema.Struct({ id: Schema.String }),
      returns: Schema.Void,
      error: NotFound,
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
      args: Schema.Struct({ id: Schema.String }),
      returns: Schema.Void,
      error: Schema.Union(NotFound, Forbidden),
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

describe("maybeDecodeErrorSync", () => {
  test("decodes ConvexError when error schema is present", () => {
    class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
      id: Schema.String,
    }) {}

    const spec = FunctionSpec.publicMutation({
      name: "update",
      args: Schema.Struct({}),
      returns: Schema.Void,
      error: NotFound,
    });
    const ref = Ref.make("test/mod", spec);

    const convexError = new ConvexError({
      _tag: "NotFound",
      id: "abc",
    });
    const decoded = Ref.maybeDecodeErrorSync(ref, convexError);
    expect(decoded).toBeInstanceOf(NotFound);
    expect((decoded as NotFound).id).toBe("abc");
  });

  test("returns original error when no error schema", () => {
    const spec = FunctionSpec.publicMutation({
      name: "create",
      args: Schema.Struct({}),
      returns: Schema.Void,
    });
    const ref = Ref.make("test/mod", spec);

    const convexError = new ConvexError({ code: "ERR" });
    const result = Ref.maybeDecodeErrorSync(ref, convexError);
    expect(result).toBe(convexError);
  });

  test("returns non-ConvexError errors unchanged", () => {
    class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
      id: Schema.String,
    }) {}

    const spec = FunctionSpec.publicMutation({
      name: "update",
      args: Schema.Struct({}),
      returns: Schema.Void,
      error: NotFound,
    });
    const ref = Ref.make("test/mod", spec);

    const plainError = new Error("network error");
    expect(Ref.maybeDecodeErrorSync(ref, plainError)).toBe(plainError);
  });
});

describe("decodeError", () => {
  test("decodes error data using the error schema", async () => {
    class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
      id: Schema.String,
    }) {}

    const spec = FunctionSpec.publicMutation({
      name: "update",
      args: Schema.Struct({}),
      returns: Schema.Void,
      error: NotFound,
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
      args: Schema.Struct({}),
      returns: Schema.Void,
    });
    const ref = Ref.make("test/mod", spec);

    const result = await Effect.runPromise(
      Ref.decodeError(ref, { anything: "goes" }),
    );
    expect(Option.isNone(result)).toBe(true);
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
      args: Schema.Struct({}),
      returns: Schema.Void,
      error: NotFound,
    }),
  );

  const refWithoutSchema = Ref.make(
    "test/mod",
    FunctionSpec.publicMutation({
      name: "create",
      args: Schema.Struct({}),
      returns: Schema.Void,
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
        args: Schema.Struct({}),
        returns: Schema.Void,
        error: NotFound,
      }),
    );

    expect(Ref.hasErrorSchema(ref)).toBe(true);
  });

  test("returns false for Confect ref without an error schema", () => {
    const ref = Ref.make(
      "test/mod",
      FunctionSpec.publicMutation({
        name: "create",
        args: Schema.Struct({}),
        returns: Schema.Void,
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
