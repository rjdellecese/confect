/**
 * @internal
 */
export type RuntimeAndFunctionType =
  | { readonly runtime: "Convex"; readonly functionType: "query" }
  | { readonly runtime: "Convex"; readonly functionType: "mutation" }
  | { readonly runtime: "Convex"; readonly functionType: "action" }
  | { readonly runtime: "Node"; readonly functionType: "action" };

/**
 * @internal
 */
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

/**
 * @internal
 */
export type AnyQuery = Extract<
  RuntimeAndFunctionType,
  { readonly functionType: "query" }
>;

/**
 * @internal
 */
export type AnyMutation = Extract<
  RuntimeAndFunctionType,
  { readonly functionType: "mutation" }
>;

/**
 * @internal
 */
export type AnyAction = Extract<
  RuntimeAndFunctionType,
  { readonly functionType: "action" }
>;

/**
 * @internal
 */
export type WithRuntime<Runtime_ extends Runtime> = Extract<
  RuntimeAndFunctionType,
  { readonly runtime: Runtime_ }
>;

/**
 * @internal
 */
export type GetRuntime<RuntimeAndFunctionType_ extends RuntimeAndFunctionType> =
  RuntimeAndFunctionType_["runtime"];

/**
 * @internal
 */
export type GetFunctionType<
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType,
> = RuntimeAndFunctionType_["functionType"];

/**
 * @internal
 */
export const ConvexQuery = make("Convex", "query");
/**
 * @internal
 */
export type ConvexQuery = typeof ConvexQuery;

/**
 * @internal
 */
export const ConvexMutation = make("Convex", "mutation");
/**
 * @internal
 */
export type ConvexMutation = typeof ConvexMutation;

/**
 * @internal
 */
export const ConvexAction = make("Convex", "action");
/**
 * @internal
 */
export type ConvexAction = typeof ConvexAction;

/**
 * @internal
 */
export const NodeAction = make("Node", "action");
/**
 * @internal
 */
export type NodeAction = typeof NodeAction;
