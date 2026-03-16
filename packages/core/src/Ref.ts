import type { FunctionVisibility } from "convex/server";
import type * as FunctionSpec from "./FunctionSpec";
import type * as RuntimeAndFunctionType from "./RuntimeAndFunctionType";

export interface Ref<
  _RuntimeAndFunctionType extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  _FunctionVisibility extends FunctionVisibility,
  _Args,
  _Returns,
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
  any,
  any
> {}

export interface AnyMutation extends Ref<
  RuntimeAndFunctionType.AnyMutation,
  FunctionVisibility,
  any,
  any
> {}

export interface AnyAction extends Ref<
  RuntimeAndFunctionType.AnyAction,
  FunctionVisibility,
  any,
  any
> {}

export interface AnyPublicQuery extends Ref<
  RuntimeAndFunctionType.AnyQuery,
  "public",
  any,
  any
> {}

export interface AnyPublicMutation extends Ref<
  RuntimeAndFunctionType.AnyMutation,
  "public",
  any,
  any
> {}

export interface AnyPublicAction extends Ref<
  RuntimeAndFunctionType.AnyAction,
  "public",
  any,
  any
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

export const make = <FunctionSpec_ extends FunctionSpec.AnyWithProps>(
  /**
   * This is a Convex "function name" of the format `myGroupDir/myGroupMod:myFunc`.
   */
  convexFunctionName: string,
  functionSpec: FunctionSpec_,
): FromFunctionSpec<FunctionSpec_> =>
  ({
    [HiddenFunctionSpecKey]: functionSpec,
    [HiddenConvexFunctionNameKey]: convexFunctionName,
  }) as FromFunctionSpec<FunctionSpec_>;

const HiddenFunctionSpecKey = "@confect/core/api/HiddenFunctionSpecKey";

export const getFunctionSpec = (ref: Any): FunctionSpec.AnyWithProps =>
  (ref as any)[HiddenFunctionSpecKey];

const HiddenConvexFunctionNameKey =
  "@confect/core/api/HiddenConvexFunctionNameKey";

export const getConvexFunctionName = (ref: Any): string =>
  (ref as any)[HiddenConvexFunctionNameKey];
