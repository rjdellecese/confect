import type { FunctionVisibility } from "convex/server";
import type { Schema } from "effect";
import type * as FunctionSpec from "./FunctionSpec";
import type * as Runtime from "./Runtime";

export interface Ref<
  Runtime_ extends Runtime.Runtime,
  FunctionType_ extends Runtime.FunctionType<Runtime_>,
  _FunctionVisibility extends FunctionVisibility,
  _Args extends Schema.Schema.AnyNoContext,
  _Returns extends Schema.Schema.AnyNoContext,
> {
  readonly _FunctionType?: FunctionType_;
  readonly _FunctionVisibility?: _FunctionVisibility;
  readonly _Args?: _Args;
  readonly _Returns?: _Returns;
}

export interface Any extends Ref<any, any, any, any, any> {}

export interface AnyInternal extends Ref<any, any, "internal", any, any> {}

export interface AnyPublic extends Ref<any, any, "public", any, any> {}

export interface AnyQuery extends Ref<
  "Convex",
  "query",
  FunctionVisibility,
  Schema.Schema.AnyNoContext,
  Schema.Schema.AnyNoContext
> {}

export interface AnyMutation extends Ref<
  "Convex",
  "mutation",
  FunctionVisibility,
  Schema.Schema.AnyNoContext,
  Schema.Schema.AnyNoContext
> {}

export interface AnyAction extends Ref<
  Runtime.Runtime,
  "action",
  FunctionVisibility,
  Schema.Schema.AnyNoContext,
  Schema.Schema.AnyNoContext
> {}

export interface AnyPublicQuery extends Ref<
  "Convex",
  "query",
  "public",
  Schema.Schema.AnyNoContext,
  Schema.Schema.AnyNoContext
> {}

export interface AnyPublicMutation extends Ref<
  "Convex",
  "mutation",
  "public",
  Schema.Schema.AnyNoContext,
  Schema.Schema.AnyNoContext
> {}

export interface AnyPublicAction extends Ref<
  Runtime.Runtime,
  "action",
  "public",
  Schema.Schema.AnyNoContext,
  Schema.Schema.AnyNoContext
> {}

export type GetRuntime<Ref_> =
  Ref_ extends Ref<
    infer Runtime_,
    infer _FunctionType,
    infer _FunctionVisibility,
    infer _Args,
    infer _Returns
  >
    ? Runtime_
    : never;

export type GetFunctionType<Ref_> =
  Ref_ extends Ref<
    infer _Runtime,
    infer FunctionType_,
    infer _FunctionVisibility,
    infer _Args,
    infer _Returns
  >
    ? FunctionType_
    : never;

export type GetFunctionVisibility<Ref_> =
  Ref_ extends Ref<
    infer _Runtime,
    infer _FunctionType,
    infer FunctionVisibility_,
    infer _Args,
    infer _Returns
  >
    ? FunctionVisibility_
    : never;

export type Args<Ref_> =
  Ref_ extends Ref<
    infer _Runtime,
    infer _FunctionType,
    infer _FunctionVisibility,
    infer Args_,
    infer _Returns
  >
    ? Args_
    : never;

export type Returns<Ref_> =
  Ref_ extends Ref<
    infer _Runtime,
    infer _FunctionType,
    infer _FunctionVisibility,
    infer _Args,
    infer Returns_
  >
    ? Returns_
    : never;

export type FromFunctionSpec<F extends FunctionSpec.AnyWithProps> = Ref<
  FunctionSpec.GetRuntime<F>,
  Runtime.FunctionType<FunctionSpec.GetRuntime<F>>,
  FunctionSpec.GetFunctionVisibility<F>,
  FunctionSpec.Args<F>,
  FunctionSpec.Returns<F>
>;

export const make = <
  Runtime_ extends Runtime.Runtime,
  FunctionType_ extends Runtime.FunctionType<Runtime_>,
  FunctionVisibility_ extends FunctionVisibility,
  Args_ extends Schema.Schema.AnyNoContext,
  Returns_ extends Schema.Schema.AnyNoContext,
>(
  /**
   * This is a Convex "function name" of the format "myGroupDir/myGroupMod:myFunc".
   */
  convexFunctionName: string,
  function_: FunctionSpec.FunctionSpec<
    Runtime_,
    FunctionType_,
    FunctionVisibility_,
    string,
    Args_,
    Returns_
  >,
): Ref<Runtime_, FunctionType_, FunctionVisibility_, Args_, Returns_> =>
  ({
    [HiddenFunctionKey]: function_,
    [HiddenConvexFunctionNameKey]: convexFunctionName,
  }) as Ref<Runtime_, FunctionType_, FunctionVisibility_, Args_, Returns_>;

const HiddenFunctionKey = "@confect/core/api/HiddenFunctionKey";
type HiddenFunctionKey = typeof HiddenFunctionKey;
type HiddenFunction<
  Ref_ extends Any,
  FunctionType_ extends Runtime.FunctionType<GetRuntime<Ref_>>,
> = FunctionSpec.FunctionSpec<
  GetRuntime<Ref_>,
  FunctionType_,
  GetFunctionVisibility<Ref_>,
  string,
  Args<Ref_>,
  Returns<Ref_>
>;

export const getFunction = <
  Runtime_ extends Runtime.Runtime,
  FunctionType_ extends Runtime.FunctionType<Runtime_>,
  FunctionVisibility_ extends FunctionVisibility,
  Args_ extends Schema.Schema.AnyNoContext,
  Returns_ extends Schema.Schema.AnyNoContext,
  Ref_ extends Ref<
    Runtime_,
    FunctionType_,
    FunctionVisibility_,
    Args_,
    Returns_
  >,
>(
  ref: Ref_,
): HiddenFunction<Ref_, FunctionType_> => (ref as any)[HiddenFunctionKey];

const HiddenConvexFunctionNameKey =
  "@confect/core/api/HiddenConvexFunctionNameKey";
type HiddenConvexFunctionNameKey = typeof HiddenConvexFunctionNameKey;
type HiddenConvexFunctionName = string;

export const getConvexFunctionName = <
  Runtime_ extends Runtime.Runtime,
  FunctionType_ extends Runtime.FunctionType<Runtime_>,
  FunctionVisibility_ extends FunctionVisibility,
  Args_ extends Schema.Schema.AnyNoContext,
  Returns_ extends Schema.Schema.AnyNoContext,
>(
  ref: Ref<Runtime_, FunctionType_, FunctionVisibility_, Args_, Returns_>,
): HiddenConvexFunctionName => (ref as any)[HiddenConvexFunctionNameKey];
