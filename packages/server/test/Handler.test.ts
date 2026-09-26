import { FunctionSpec } from "@confect/core";
import { describe, expectTypeOf, it } from "@effect/vitest";
import type {
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import type { Infer } from "convex/values";
import { v } from "convex/values";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { ExecutionMetadata } from "@confect/server/ExecutionMetadata";
import type * as Handler from "@confect/server/Handler";
import type * as HttpRouter from "@confect/server/HttpRouter";
import type { RequestMetadata } from "@confect/server/RequestMetadata";
import type { Transaction } from "@confect/server/Transaction";
import type schema from "./mock-backend/fixtures/confect/_generated/schema";
import {
  internalAction,
  mutation,
  query,
} from "./mock-backend/fixtures/convex/_generated/server";

type ExtractQueryReturns<F> =
  F extends RegisteredQuery<any, any, infer R> ? R : never;

type ExtractMutationReturns<F> =
  F extends RegisteredMutation<any, any, infer R> ? R : never;

type ExtractActionReturns<F> =
  F extends RegisteredAction<any, any, infer R> ? R : never;

describe("Handler", () => {
  describe("metadata service availability", () => {
    type MetadataServices = ExecutionMetadata | RequestMetadata | Transaction;

    it("allows execution metadata and transaction metrics in queries", () => {
      expectTypeOf<
        Extract<Handler.QueryServices<typeof schema>, MetadataServices>
      >().toEqualTypeOf<ExecutionMetadata | Transaction>();
      expectTypeOf<RequestMetadata>().not.toExtend<
        Handler.QueryServices<typeof schema>
      >();
    });

    it("allows every metadata service in mutations", () => {
      expectTypeOf<
        Extract<Handler.MutationServices<typeof schema>, MetadataServices>
      >().toEqualTypeOf<MetadataServices>();
    });

    it("allows execution and request metadata but not transactions in both action runtimes", () => {
      const action = FunctionSpec.publicAction({
        name: "action",
        returns: () => Schema.Null,
      });
      const nodeAction = FunctionSpec.publicNodeAction({
        name: "nodeAction",
        returns: () => Schema.Null,
      });
      type ActionEnvironment = Effect.Services<
        ReturnType<Handler.Handler<typeof schema, typeof action>>
      >;
      type NodeActionEnvironment = Effect.Services<
        ReturnType<Handler.Handler<typeof schema, typeof nodeAction>>
      >;

      expectTypeOf<
        Extract<ActionEnvironment, MetadataServices>
      >().toEqualTypeOf<ExecutionMetadata | RequestMetadata>();
      expectTypeOf<
        Extract<NodeActionEnvironment, MetadataServices>
      >().toEqualTypeOf<ExecutionMetadata | RequestMetadata>();
      expectTypeOf<Transaction>().not.toExtend<ActionEnvironment>();
      expectTypeOf<Transaction>().not.toExtend<NodeActionEnvironment>();
    });

    it("allows execution and request metadata but not transactions in HTTP handlers", () => {
      expectTypeOf<
        Extract<HttpRouter.Services, MetadataServices>
      >().toEqualTypeOf<ExecutionMetadata | RequestMetadata>();
      expectTypeOf<Transaction>().not.toExtend<HttpRouter.Services>();
    });
  });

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
        handler: () => Effect.runPromise(Effect.succeed(["hello"])),
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
        handler: () => Effect.runPromise(Effect.succeed(null)),
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
        handler: () => Effect.runPromise(Effect.succeed({ status: 200 })),
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
