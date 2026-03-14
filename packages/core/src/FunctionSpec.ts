import type {
  DefaultFunctionArgs,
  FunctionType,
  FunctionVisibility,
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import type { Schema } from "effect";
import { Predicate } from "effect";
import * as FunctionProvenance from "./FunctionProvenance";
import { validateConfectFunctionIdentifier } from "./internal/utils";
import * as RuntimeAndFunctionType from "./RuntimeAndFunctionType";

export const TypeId = "@confect/core/FunctionSpec";
export type TypeId = typeof TypeId;

export const isFunctionSpec = (u: unknown): u is AnyWithProps =>
  Predicate.hasProperty(u, TypeId);

export interface FunctionSpec<
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility_ extends FunctionVisibility,
  Name_ extends string,
  FunctionProvenance_ extends FunctionProvenance.FunctionProvenance,
> {
  readonly [TypeId]: TypeId;
  readonly runtimeAndFunctionType: RuntimeAndFunctionType_;
  readonly functionVisibility: FunctionVisibility_;
  readonly name: Name_;
  readonly functionProvenance: FunctionProvenance_;
}

export interface Any {
  readonly [TypeId]: TypeId;
}

export interface AnyWithProps extends FunctionSpec<
  RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility,
  string,
  FunctionProvenance.FunctionProvenance
> {}

export interface AnyConfect extends FunctionSpec<
  RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility,
  string,
  FunctionProvenance.AnyConfect
> {}

export interface AnyConvex extends FunctionSpec<
  RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility,
  string,
  FunctionProvenance.AnyConvex
> {}

export interface AnyWithPropsWithRuntime<
  Runtime extends RuntimeAndFunctionType.Runtime,
> extends FunctionSpec<
  RuntimeAndFunctionType.WithRuntime<Runtime>,
  FunctionVisibility,
  string,
  FunctionProvenance.FunctionProvenance
> {}

export interface AnyWithPropsWithFunctionType<
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
> extends FunctionSpec<
  RuntimeAndFunctionType_,
  FunctionVisibility,
  string,
  FunctionProvenance.FunctionProvenance
> {}

export interface AnyWithPropsWithFunctionProvenance<
  FunctionProvenance_ extends FunctionProvenance.FunctionProvenance,
> extends FunctionSpec<
  RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility,
  string,
  FunctionProvenance_
> {}

export type GetRuntimeAndFunctionType<Function extends AnyWithProps> =
  Function["runtimeAndFunctionType"];

export type GetFunctionVisibility<Function extends AnyWithProps> =
  Function["functionVisibility"];

export type Name<Function extends AnyWithProps> = Function["name"];

export type Args<Function extends AnyWithProps> = Function extends {
  functionProvenance: {
    _tag: "Confect";
    args: infer ArgsSchema_ extends Schema.Schema.AnyNoContext;
  };
}
  ? ArgsSchema_["Type"]
  : Function extends {
        functionProvenance: { _tag: "Convex"; _args: infer Args_ };
      }
    ? Args_
    : never;

export type Returns<Function extends AnyWithProps> = Function extends {
  functionProvenance: {
    _tag: "Confect";
    returns: infer ReturnsSchema_ extends Schema.Schema.AnyNoContext;
  };
}
  ? ReturnsSchema_["Type"]
  : Function extends {
        functionProvenance: { _tag: "Convex"; _returns: infer Returns_ };
      }
    ? Awaited<Returns_>
    : never;

export type EncodedArgs<Function extends AnyWithProps> = Function extends {
  functionProvenance: {
    _tag: "Confect";
    args: infer ArgsSchema_ extends Schema.Schema.AnyNoContext;
  };
}
  ? ArgsSchema_["Encoded"]
  : Function extends {
        functionProvenance: { _tag: "Convex"; _args: infer Args_ };
      }
    ? Args_
    : never;

export type EncodedReturns<Function extends AnyWithProps> = Function extends {
  functionProvenance: {
    _tag: "Confect";
    returns: infer ReturnsSchema_ extends Schema.Schema.AnyNoContext;
  };
}
  ? ReturnsSchema_["Encoded"]
  : Function extends {
        functionProvenance: { _tag: "Convex"; _returns: infer Returns_ };
      }
    ? Returns_
    : never;

export type WithName<
  Function extends AnyWithProps,
  Name_ extends string,
> = Extract<Function, { readonly name: Name_ }>;

export type WithRuntimeAndFunctionType<
  Function extends AnyWithProps,
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
> = Extract<
  Function,
  { readonly runtimeAndFunctionType: RuntimeAndFunctionType_ }
>;

export type WithFunctionType<
  Function extends AnyWithProps,
  FunctionType_ extends FunctionType,
> = Extract<
  Function,
  { readonly runtimeAndFunctionType: { readonly functionType: FunctionType_ } }
>;

export type WithFunctionProvenance<
  Function extends AnyWithProps,
  FunctionProvenance_ extends FunctionProvenance.FunctionProvenance,
> = Extract<Function, { readonly functionProvenance: FunctionProvenance_ }>;

export type WithoutName<
  Function extends AnyWithProps,
  Name_ extends Name<Function>,
> = Exclude<Function, { readonly name: Name_ }>;

type ConfectRegisteredFunction<Function extends AnyWithProps> =
  EncodedArgs<Function> extends infer Args_ extends DefaultFunctionArgs
    ? RuntimeAndFunctionType.GetFunctionType<
        Function["runtimeAndFunctionType"]
      > extends "query"
      ? RegisteredQuery<
          GetFunctionVisibility<Function>,
          Args_,
          Promise<EncodedReturns<Function>>
        >
      : RuntimeAndFunctionType.GetFunctionType<
            Function["runtimeAndFunctionType"]
          > extends "mutation"
        ? RegisteredMutation<
            GetFunctionVisibility<Function>,
            Args_,
            Promise<EncodedReturns<Function>>
          >
        : RuntimeAndFunctionType.GetFunctionType<
              Function["runtimeAndFunctionType"]
            > extends "action"
          ? RegisteredAction<
              GetFunctionVisibility<Function>,
              Args_,
              Promise<EncodedReturns<Function>>
            >
          : never
    : never;

type ConvexRegisteredFunction<Function extends AnyWithProps> =
  Function extends {
    functionProvenance: {
      _tag: "Convex";
      _args: infer Args_ extends DefaultFunctionArgs;
      _returns: infer Returns_;
    };
  }
    ? RuntimeAndFunctionType.GetFunctionType<
        Function["runtimeAndFunctionType"]
      > extends "query"
      ? RegisteredQuery<GetFunctionVisibility<Function>, Args_, Returns_>
      : RuntimeAndFunctionType.GetFunctionType<
            Function["runtimeAndFunctionType"]
          > extends "mutation"
        ? RegisteredMutation<GetFunctionVisibility<Function>, Args_, Returns_>
        : RuntimeAndFunctionType.GetFunctionType<
              Function["runtimeAndFunctionType"]
            > extends "action"
          ? RegisteredAction<GetFunctionVisibility<Function>, Args_, Returns_>
          : never
    : never;

export type RegisteredFunction<Function extends AnyWithProps> =
  Function extends { functionProvenance: { _tag: "Convex" } }
    ? ConvexRegisteredFunction<Function>
    : ConfectRegisteredFunction<Function>;

const Proto = {
  [TypeId]: TypeId,
};

const make =
  <
    RuntimeAndFunctionType_ extends
      RuntimeAndFunctionType.RuntimeAndFunctionType,
    FunctionVisibility_ extends FunctionVisibility,
  >(
    runtimeAndFunctionType: RuntimeAndFunctionType_,
    functionVisibility: FunctionVisibility_,
  ) =>
  <
    const Name_ extends string,
    Args_ extends Schema.Schema.AnyNoContext,
    Returns_ extends Schema.Schema.AnyNoContext,
  >({
    name,
    args,
    returns,
  }: {
    name: Name_;
    args: Args_;
    returns: Returns_;
  }): FunctionSpec<
    RuntimeAndFunctionType_,
    FunctionVisibility_,
    Name_,
    FunctionProvenance.Confect<Args_, Returns_>
  > => {
    validateConfectFunctionIdentifier(name);

    return Object.assign(Object.create(Proto), {
      runtimeAndFunctionType,
      functionVisibility,
      name,
      functionProvenance: FunctionProvenance.Confect(args, returns),
    });
  };

export const publicQuery = make(RuntimeAndFunctionType.ConvexQuery, "public");
export const internalQuery = make(
  RuntimeAndFunctionType.ConvexQuery,
  "internal",
);
export const publicMutation = make(
  RuntimeAndFunctionType.ConvexMutation,
  "public",
);
export const internalMutation = make(
  RuntimeAndFunctionType.ConvexMutation,
  "internal",
);
export const publicAction = make(RuntimeAndFunctionType.ConvexAction, "public");
export const internalAction = make(
  RuntimeAndFunctionType.ConvexAction,
  "internal",
);

export const publicNodeAction = make(
  RuntimeAndFunctionType.NodeAction,
  "public",
);
export const internalNodeAction = make(
  RuntimeAndFunctionType.NodeAction,
  "internal",
);

type MatchingRegisteredFunction<
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility_ extends FunctionVisibility,
> =
  RuntimeAndFunctionType.GetFunctionType<RuntimeAndFunctionType_> extends "query"
    ? RegisteredQuery<FunctionVisibility_, any, any>
    : RuntimeAndFunctionType.GetFunctionType<RuntimeAndFunctionType_> extends "mutation"
      ? RegisteredMutation<FunctionVisibility_, any, any>
      : RuntimeAndFunctionType.GetFunctionType<RuntimeAndFunctionType_> extends "action"
        ? RegisteredAction<FunctionVisibility_, any, any>
        : never;

type ExtractArgs<F> =
  F extends RegisteredQuery<any, infer A, any>
    ? A
    : F extends RegisteredMutation<any, infer A, any>
      ? A
      : F extends RegisteredAction<any, infer A, any>
        ? A
        : never;

type ExtractReturns<F> =
  F extends RegisteredQuery<any, any, infer R>
    ? R
    : F extends RegisteredMutation<any, any, infer R>
      ? R
      : F extends RegisteredAction<any, any, infer R>
        ? R
        : never;

const makeConvex =
  <
    RuntimeAndFunctionType_ extends
      RuntimeAndFunctionType.RuntimeAndFunctionType,
    FunctionVisibility_ extends FunctionVisibility,
  >(
    runtimeAndFunctionType: RuntimeAndFunctionType_,
    functionVisibility: FunctionVisibility_,
  ) =>
  <
    F extends MatchingRegisteredFunction<
      RuntimeAndFunctionType_,
      FunctionVisibility_
    >,
  >() =>
  <const Name_ extends string>(
    name: Name_,
  ): FunctionSpec<
    RuntimeAndFunctionType_,
    FunctionVisibility_,
    Name_,
    FunctionProvenance.Convex<ExtractArgs<F>, ExtractReturns<F>>
  > => {
    validateConfectFunctionIdentifier(name);

    return Object.assign(Object.create(Proto), {
      runtimeAndFunctionType,
      functionVisibility,
      name,
      functionProvenance: FunctionProvenance.Convex(),
    }) as any;
  };

export const convexPublicQuery = makeConvex(
  RuntimeAndFunctionType.ConvexQuery,
  "public",
);
export const convexInternalQuery = makeConvex(
  RuntimeAndFunctionType.ConvexQuery,
  "internal",
);
export const convexPublicMutation = makeConvex(
  RuntimeAndFunctionType.ConvexMutation,
  "public",
);
export const convexInternalMutation = makeConvex(
  RuntimeAndFunctionType.ConvexMutation,
  "internal",
);
export const convexPublicAction = makeConvex(
  RuntimeAndFunctionType.ConvexAction,
  "public",
);
export const convexInternalAction = makeConvex(
  RuntimeAndFunctionType.ConvexAction,
  "internal",
);
export const convexPublicNodeAction = makeConvex(
  RuntimeAndFunctionType.NodeAction,
  "public",
);
export const convexInternalNodeAction = makeConvex(
  RuntimeAndFunctionType.NodeAction,
  "internal",
);
