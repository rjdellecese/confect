import type { FunctionVisibility } from "convex/server";
import type { Schema } from "effect";
import type * as FunctionSpec from "./FunctionSpec";
import type * as RuntimeAndFunctionType from "./RuntimeAndFunctionType";

export interface Ref<
  _RuntimeAndFunctionType extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  _FunctionVisibility extends FunctionVisibility,
  _Args extends Schema.Schema.AnyNoContext,
  _Returns extends Schema.Schema.AnyNoContext,
> {
  readonly _RuntimeAndFunctionType?: _RuntimeAndFunctionType;
  readonly _FunctionVisibility?: _FunctionVisibility;
  readonly _Args?: _Args;
  readonly _Returns?: _Returns;
}

export interface Any extends Ref<any, any, any, any> {}

export interface AnyInternal extends Ref<any, "internal", any, any> {}

export interface AnyPublic extends Ref<any, "public", any, any> {}

export interface AnyQuery extends Ref<
  RuntimeAndFunctionType.AnyQuery,
  FunctionVisibility,
  Schema.Schema.AnyNoContext,
  Schema.Schema.AnyNoContext
> {}

export interface AnyMutation extends Ref<
  RuntimeAndFunctionType.AnyMutation,
  FunctionVisibility,
  Schema.Schema.AnyNoContext,
  Schema.Schema.AnyNoContext
> {}

export interface AnyAction extends Ref<
  RuntimeAndFunctionType.AnyAction,
  FunctionVisibility,
  Schema.Schema.AnyNoContext,
  Schema.Schema.AnyNoContext
> {}

export interface AnyPublicQuery extends Ref<
  RuntimeAndFunctionType.AnyQuery,
  "public",
  Schema.Schema.AnyNoContext,
  Schema.Schema.AnyNoContext
> {}

export interface AnyPublicMutation extends Ref<
  RuntimeAndFunctionType.AnyMutation,
  "public",
  Schema.Schema.AnyNoContext,
  Schema.Schema.AnyNoContext
> {}

export interface AnyPublicAction extends Ref<
  RuntimeAndFunctionType.AnyAction,
  "public",
  Schema.Schema.AnyNoContext,
  Schema.Schema.AnyNoContext
> {}

export type GetRuntimeAndFunctionType<Ref_> =
  Ref_ extends Ref<
    infer RuntimeAndFunctionType_,
    infer _FunctionVisibility,
    infer _Args,
    infer _Returns
  >
    ? RuntimeAndFunctionType_
    : never;

export type GetRuntime<Ref_> =
  Ref_ extends Ref<
    infer RuntimeAndFunctionType_,
    infer _FunctionVisibility,
    infer _Args,
    infer _Returns
  >
    ? RuntimeAndFunctionType.GetRuntime<RuntimeAndFunctionType_>
    : never;

export type GetFunctionType<Ref_> =
  Ref_ extends Ref<
    infer RuntimeAndFunctionType_,
    infer _FunctionVisibility,
    infer _Args,
    infer _Returns
  >
    ? RuntimeAndFunctionType.GetFunctionType<RuntimeAndFunctionType_>
    : never;

export type GetFunctionVisibility<Ref_> =
  Ref_ extends Ref<
    infer _RuntimeAndFunctionType,
    infer FunctionVisibility_,
    infer _Args,
    infer _Returns
  >
    ? FunctionVisibility_
    : never;

export type Args<Ref_> =
  Ref_ extends Ref<
    infer _RuntimeAndFunctionType,
    infer _FunctionVisibility,
    infer Args_,
    infer _Returns
  >
    ? Args_
    : never;

export type Returns<Ref_> =
  Ref_ extends Ref<
    infer _RuntimeAndFunctionType,
    infer _FunctionVisibility,
    infer _Args,
    infer Returns_
  >
    ? Returns_
    : never;

export type FromFunctionSpec<F extends FunctionSpec.AnyWithProps> = Ref<
  FunctionSpec.GetRuntimeAndFunctionType<F>,
  FunctionSpec.GetFunctionVisibility<F>,
  FunctionSpec.Args<F>,
  FunctionSpec.Returns<F>
>;

export const make = <
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility_ extends FunctionVisibility,
  Args_ extends Schema.Schema.AnyNoContext,
  Returns_ extends Schema.Schema.AnyNoContext,
>(
  /**
   * This is a Convex "function name" of the format "myGroupDir/myGroupMod:myFunc".
   */
  convexFunctionName: string,
  function_: FunctionSpec.FunctionSpec<
    RuntimeAndFunctionType_,
    FunctionVisibility_,
    string,
    Args_,
    Returns_
  >,
): Ref<RuntimeAndFunctionType_, FunctionVisibility_, Args_, Returns_> =>
  ({
    [HiddenFunctionKey]: function_,
    [HiddenConvexFunctionNameKey]: convexFunctionName,
  }) as Ref<RuntimeAndFunctionType_, FunctionVisibility_, Args_, Returns_>;

const HiddenFunctionKey = "@confect/core/api/HiddenFunctionKey";
type HiddenFunctionKey = typeof HiddenFunctionKey;
type HiddenFunction<Ref_ extends Any> = FunctionSpec.FunctionSpec<
  GetRuntimeAndFunctionType<Ref_>,
  GetFunctionVisibility<Ref_>,
  string,
  Args<Ref_>,
  Returns<Ref_>
>;

export const getFunction = <
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility_ extends FunctionVisibility,
  Args_ extends Schema.Schema.AnyNoContext,
  Returns_ extends Schema.Schema.AnyNoContext,
  Ref_ extends Ref<
    RuntimeAndFunctionType_,
    FunctionVisibility_,
    Args_,
    Returns_
  >,
>(
  ref: Ref_,
): HiddenFunction<Ref_> => (ref as any)[HiddenFunctionKey];

const HiddenConvexFunctionNameKey =
  "@confect/core/api/HiddenConvexFunctionNameKey";
type HiddenConvexFunctionNameKey = typeof HiddenConvexFunctionNameKey;
type HiddenConvexFunctionName = string;

export const getConvexFunctionName = <
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility_ extends FunctionVisibility,
  Args_ extends Schema.Schema.AnyNoContext,
  Returns_ extends Schema.Schema.AnyNoContext,
>(
  ref: Ref<RuntimeAndFunctionType_, FunctionVisibility_, Args_, Returns_>,
): HiddenConvexFunctionName => (ref as any)[HiddenConvexFunctionNameKey];
