import type { FunctionReference, FunctionVisibility } from "convex/server";
import { describe, expectTypeOf, test } from "vitest";

import type * as Ref from "../src/Ref";
import type * as RuntimeAndFunctionType from "../src/RuntimeAndFunctionType";

describe("ToFunctionReference", () => {
  test("public query ref -> FunctionReference<'query', 'public'>", () => {
    expectTypeOf<Ref.ToFunctionReference<Ref.AnyPublicQuery>>().toEqualTypeOf<
      FunctionReference<"query", "public">
    >();
  });

  test("public mutation ref -> FunctionReference<'mutation', 'public'>", () => {
    expectTypeOf<
      Ref.ToFunctionReference<Ref.AnyPublicMutation>
    >().toEqualTypeOf<FunctionReference<"mutation", "public">>();
  });

  test("public action ref -> FunctionReference<'action', 'public'>", () => {
    expectTypeOf<Ref.ToFunctionReference<Ref.AnyPublicAction>>().toEqualTypeOf<
      FunctionReference<"action", "public">
    >();
  });

  test("concrete public query ref preserves exact type params", () => {
    type MyRef = Ref.Ref<
      RuntimeAndFunctionType.ConvexQuery,
      "public",
      { id: string },
      string[]
    >;
    expectTypeOf<Ref.ToFunctionReference<MyRef>>().toEqualTypeOf<
      FunctionReference<"query", "public">
    >();
  });

  test("concrete internal mutation ref -> FunctionReference<'mutation', 'internal'>", () => {
    type MyRef = Ref.Ref<
      RuntimeAndFunctionType.ConvexMutation,
      "internal",
      { name: string },
      void
    >;
    expectTypeOf<Ref.ToFunctionReference<MyRef>>().toEqualTypeOf<
      FunctionReference<"mutation", "internal">
    >();
  });

  test("concrete internal action ref -> FunctionReference<'action', 'internal'>", () => {
    type MyRef = Ref.Ref<
      RuntimeAndFunctionType.ConvexAction,
      "internal",
      Record<string, never>,
      number
    >;
    expectTypeOf<Ref.ToFunctionReference<MyRef>>().toEqualTypeOf<
      FunctionReference<"action", "internal">
    >();
  });

  test("node action ref -> FunctionReference<'action', ...>", () => {
    type MyRef = Ref.Ref<
      RuntimeAndFunctionType.NodeAction,
      "public",
      Record<string, never>,
      void
    >;
    expectTypeOf<Ref.ToFunctionReference<MyRef>>().toEqualTypeOf<
      FunctionReference<"action", "public">
    >();
  });

  test("AnyQuery ref -> FunctionReference<'query', FunctionVisibility>", () => {
    expectTypeOf<Ref.ToFunctionReference<Ref.AnyQuery>>().toEqualTypeOf<
      FunctionReference<"query", FunctionVisibility>
    >();
  });

  test("AnyMutation ref -> FunctionReference<'mutation', FunctionVisibility>", () => {
    expectTypeOf<Ref.ToFunctionReference<Ref.AnyMutation>>().toEqualTypeOf<
      FunctionReference<"mutation", FunctionVisibility>
    >();
  });

  test("AnyAction ref -> FunctionReference<'action', FunctionVisibility>", () => {
    expectTypeOf<Ref.ToFunctionReference<Ref.AnyAction>>().toEqualTypeOf<
      FunctionReference<"action", FunctionVisibility>
    >();
  });
});
