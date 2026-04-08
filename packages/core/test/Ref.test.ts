import type { FunctionReference, FunctionVisibility } from "convex/server";
import { describe, expectTypeOf, test } from "vitest";

import type * as FunctionSpec from "../src/FunctionSpec";
import type * as Ref from "../src/Ref";

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
