import type { FunctionType, FunctionVisibility } from "convex/server";
import type { Schema } from "effect";
import type * as FunctionSpec from "./FunctionSpec";

export interface Ref<
  _FunctionType extends FunctionType,
  _FunctionVisibility extends FunctionVisibility,
  _Args extends Schema.Schema.AnyNoContext,
  _Returns extends Schema.Schema.AnyNoContext,
> {
  readonly _FunctionType?: _FunctionType;
  readonly _FunctionVisibility?: _FunctionVisibility;
  readonly _Args?: _Args;
  readonly _Returns?: _Returns;
}

export interface Any extends Ref<any, any, any, any> {}

export interface AnyInternal extends Ref<any, "internal", any, any> {}

export interface AnyPublic extends Ref<any, "public", any, any> {}

export interface AnyQuery
  extends Ref<
    "query",
    FunctionVisibility,
    Schema.Schema.AnyNoContext,
    Schema.Schema.AnyNoContext
  > {}

export interface AnyMutation
  extends Ref<
    "mutation",
    FunctionVisibility,
    Schema.Schema.AnyNoContext,
    Schema.Schema.AnyNoContext
  > {}

export interface AnyAction
  extends Ref<
    "action",
    FunctionVisibility,
    Schema.Schema.AnyNoContext,
    Schema.Schema.AnyNoContext
  > {}

export interface AnyPublicQuery
  extends Ref<
    "query",
    "public",
    Schema.Schema.AnyNoContext,
    Schema.Schema.AnyNoContext
  > {}

export interface AnyPublicMutation
  extends Ref<
    "mutation",
    "public",
    Schema.Schema.AnyNoContext,
    Schema.Schema.AnyNoContext
  > {}

export interface AnyPublicAction
  extends Ref<
    "action",
    "public",
    Schema.Schema.AnyNoContext,
    Schema.Schema.AnyNoContext
  > {}

export type GetFunctionType<Ref_> =
  Ref_ extends Ref<
    infer FunctionType_,
    infer _FunctionVisibility,
    infer _Args,
    infer _Returns
  >
    ? FunctionType_
    : never;

export type GetFunctionVisibility<Ref_> =
  Ref_ extends Ref<
    infer _FunctionType,
    infer FunctionVisibility_,
    infer _Args,
    infer _Returns
  >
    ? FunctionVisibility_
    : never;

export type Args<Ref_> =
  Ref_ extends Ref<
    infer _FunctionType,
    infer _FunctionVisibility,
    infer Args_,
    infer _Returns
  >
    ? Args_
    : never;

export type Returns<Ref_> =
  Ref_ extends Ref<
    infer _FunctionType,
    infer _FunctionVisibility,
    infer _Args,
    infer Returns_
  >
    ? Returns_
    : never;

export const make = <
  FunctionType_ extends FunctionType,
  FunctionVisibility_ extends FunctionVisibility,
  Args_ extends Schema.Schema.AnyNoContext,
  Returns_ extends Schema.Schema.AnyNoContext,
>(
  /**
   * This is a Convex "function name" of the format "myGroupDir/myGroupMod:myFunc".
   */
  convexFunctionName: string,
  // TODO: Pull out all of the fields from the function spec except the name (we don't need it because we already have the convex function name) and spread them here
  function_: FunctionSpec.FunctionSpec<
    FunctionType_,
    FunctionVisibility_,
    string,
    Args_,
    Returns_
  >,
): Ref<FunctionType_, FunctionVisibility_, Args_, Returns_> =>
  ({
    [HiddenFunctionKey]: function_,
    [HiddenConvexFunctionNameKey]: convexFunctionName,
  }) as Ref<FunctionType_, FunctionVisibility_, Args_, Returns_>;

// TODO: Is this hidden stuff necessary/useful still?
const HiddenFunctionKey = "@confect/core/api/HiddenFunctionKey";
type HiddenFunctionKey = typeof HiddenFunctionKey;
type HiddenFunction<Ref_ extends Any> = FunctionSpec.FunctionSpec<
  GetFunctionType<Ref_>,
  GetFunctionVisibility<Ref_>,
  string,
  Args<Ref_>,
  Returns<Ref_>
>;

export const getFunction = <
  FunctionType_ extends FunctionType,
  FunctionVisibility_ extends FunctionVisibility,
  Args_ extends Schema.Schema.AnyNoContext,
  Returns_ extends Schema.Schema.AnyNoContext,
  Ref_ extends Ref<FunctionType_, FunctionVisibility_, Args_, Returns_>,
>(
  ref: Ref_,
): HiddenFunction<Ref_> => (ref as any)[HiddenFunctionKey];

const HiddenConvexFunctionNameKey =
  "@confect/core/api/HiddenConvexFunctionNameKey";
type HiddenConvexFunctionNameKey = typeof HiddenConvexFunctionNameKey;
type HiddenConvexFunctionName = string;

export const getConvexFunctionName = <
  FunctionType_ extends FunctionType,
  FunctionVisibility_ extends FunctionVisibility,
  Args_ extends Schema.Schema.AnyNoContext,
  Returns_ extends Schema.Schema.AnyNoContext,
>(
  ref: Ref<FunctionType_, FunctionVisibility_, Args_, Returns_>,
): HiddenConvexFunctionName => (ref as any)[HiddenConvexFunctionNameKey];
