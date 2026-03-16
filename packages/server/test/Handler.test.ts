import { FunctionSpec } from "@confect/core";
import { describe, expectTypeOf, it } from "@effect/vitest";
import type {
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import type { Infer } from "convex/values";
import { v } from "convex/values";
import type * as Handler from "../src/Handler";
import type schema from "./confect/schema";
import { internalAction, mutation, query } from "./convex/_generated/server";

type ExtractQueryReturns<F> =
  F extends RegisteredQuery<any, any, infer R> ? R : never;

type ExtractMutationReturns<F> =
  F extends RegisteredMutation<any, any, infer R> ? R : never;

type ExtractActionReturns<F> =
  F extends RegisteredAction<any, any, infer R> ? R : never;

describe("Handler", () => {
  describe("ConvexProvenanceHandler preserves the raw Convex registered function type", () => {
    it("query", () => {
      const vQueryArgs = { tag: v.string() };
      const _vQueryArgsObject = v.object(vQueryArgs);

      const vQueryReturns = v.array(v.string());

      type QueryArgs = Infer<typeof _vQueryArgsObject>;
      type QueryReturns = Infer<typeof vQueryReturns>;

      const _myQuery = query({
        args: vQueryArgs,
        returns: vQueryReturns,
        handler: async () => ["hello"],
      });

      const _spec =
        FunctionSpec.convexPublicQuery<typeof _myQuery>()("myQuery");

      type Result = Handler.Handler<typeof schema, typeof _spec>;

      expectTypeOf<Result>().toEqualTypeOf<
        RegisteredQuery<"public", QueryArgs, QueryReturns>
      >();

      type ResultReturns = ExtractQueryReturns<Result>;
      expectTypeOf<ResultReturns>().toEqualTypeOf<Promise<QueryReturns>>();
    });

    it("mutation", () => {
      const vMutationArgs = { id: v.string() };
      const _vMutationArgsObject = v.object(vMutationArgs);

      const vMutationReturns = v.null();

      type MutationArgs = Infer<typeof _vMutationArgsObject>;
      type MutationReturns = Infer<typeof vMutationReturns>;

      const _myMutation = mutation({
        args: vMutationArgs,
        returns: vMutationReturns,
        handler: async () => null,
      });

      const _spec =
        FunctionSpec.convexPublicMutation<typeof _myMutation>()("myMutation");

      type Result = Handler.Handler<typeof schema, typeof _spec>;

      expectTypeOf<Result>().toEqualTypeOf<
        RegisteredMutation<"public", MutationArgs, MutationReturns>
      >();

      type ResultReturns = ExtractMutationReturns<Result>;
      expectTypeOf<ResultReturns>().toEqualTypeOf<Promise<MutationReturns>>();
    });

    it("action", () => {
      const vActionArgs = { url: v.string() };
      const _vActionArgsObject = v.object(vActionArgs);

      const vActionReturns = { status: v.number() };
      const _vActionReturnsObject = v.object(vActionReturns);

      type ActionArgs = Infer<typeof _vActionArgsObject>;
      type ActionReturns = Infer<typeof _vActionReturnsObject>;

      const _myAction = internalAction({
        args: vActionArgs,
        returns: vActionReturns,
        handler: async () => ({ status: 200 }),
      });

      const _spec =
        FunctionSpec.convexInternalAction<typeof _myAction>()("myAction");

      type Result = Handler.Handler<typeof schema, typeof _spec>;

      expectTypeOf<Result>().toEqualTypeOf<
        RegisteredAction<"internal", ActionArgs, ActionReturns>
      >();

      type ResultReturns = ExtractActionReturns<Result>;
      expectTypeOf<ResultReturns>().toEqualTypeOf<Promise<ActionReturns>>();
    });
  });
});
