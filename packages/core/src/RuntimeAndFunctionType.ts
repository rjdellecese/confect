import type { FunctionType } from "convex/server";

export type RuntimeAndFunctionType =
  | { readonly runtime: "Convex"; readonly functionType: FunctionType }
  | { readonly runtime: "Node"; readonly functionType: "action" };

export type Runtime = RuntimeAndFunctionType["runtime"];

const make = <
  Runtime_ extends Runtime,
  FunctionType_ extends GetFunctionType<WithRuntime<Runtime_>>,
>(
  runtime: Runtime_,
  functionType: FunctionType_,
): { readonly runtime: Runtime_; readonly functionType: FunctionType_ } => ({
  runtime,
  functionType,
});

export type AnyQuery = Extract<
  RuntimeAndFunctionType,
  { readonly functionType: "query" }
>;

export type AnyMutation = Extract<
  RuntimeAndFunctionType,
  { readonly functionType: "mutation" }
>;

export type AnyAction = Extract<
  RuntimeAndFunctionType,
  { readonly functionType: "action" }
>;

export type WithRuntime<Runtime_ extends Runtime> = Extract<
  RuntimeAndFunctionType,
  { readonly runtime: Runtime_ }
>;

export type GetRuntime<RuntimeAndFunctionType_ extends RuntimeAndFunctionType> =
  RuntimeAndFunctionType_["runtime"];

export type GetFunctionType<
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType,
> = RuntimeAndFunctionType_["functionType"];

export const ConvexQuery = make("Convex", "query");
export type ConvexQuery = typeof ConvexQuery;

export const ConvexMutation = make("Convex", "mutation");
export type ConvexMutation = typeof ConvexMutation;

export const ConvexAction = make("Convex", "action");
export type ConvexAction = typeof ConvexAction;

export const NodeAction = make("Node", "action");
export type NodeAction = typeof NodeAction;
