import type { FunctionType } from "convex/server";
import { Data } from "effect";
import type * as Runtime from "./Runtime";

export type RuntimeAndFunctionType = Data.TaggedEnum<{
  Convex: {
    readonly functionType: FunctionType;
  };
  Node: {
    readonly functionType: "action";
  };
}>;

export const RuntimeAndFunctionType = Data.taggedEnum<RuntimeAndFunctionType>();

export type AnyQuery = Extract<
  RuntimeAndFunctionType,
  { functionType: "query" }
>;

export type AnyMutation = Extract<
  RuntimeAndFunctionType,
  { functionType: "mutation" }
>;

export type AnyAction = Extract<
  RuntimeAndFunctionType,
  { functionType: "action" }
>;

export type WithRuntime<Runtime_ extends Runtime.Runtime> = Extract<
  RuntimeAndFunctionType,
  { _tag: Runtime_ }
>;

export type GetRuntime<RuntimeAndFunctionType_ extends RuntimeAndFunctionType> =
  RuntimeAndFunctionType_["_tag"];

export type GetFunctionType<
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType,
> = RuntimeAndFunctionType_["functionType"];

export const ConvexQuery = RuntimeAndFunctionType.Convex({
  functionType: "query",
});
export type ConvexQuery = typeof ConvexQuery;

export const ConvexMutation = RuntimeAndFunctionType.Convex({
  functionType: "mutation",
});
export type ConvexMutation = typeof ConvexMutation;

export const ConvexAction = RuntimeAndFunctionType.Convex({
  functionType: "action",
});
export type ConvexAction = typeof ConvexAction;

export const NodeAction = RuntimeAndFunctionType.Node({
  functionType: "action",
});
export type NodeAction = typeof NodeAction;
