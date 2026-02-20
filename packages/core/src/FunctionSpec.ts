import type {
  FunctionType,
  FunctionVisibility,
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import type { Schema } from "effect";
import { Predicate } from "effect";
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
  Args_ extends Schema.Schema.AnyNoContext,
  Returns_ extends Schema.Schema.AnyNoContext,
> {
  readonly [TypeId]: TypeId;
  readonly runtimeAndFunctionType: RuntimeAndFunctionType_;
  readonly functionVisibility: FunctionVisibility_;
  readonly name: Name_;
  readonly args: Args_;
  readonly returns: Returns_;
}

export interface Any {
  readonly [TypeId]: TypeId;
}

export interface AnyWithProps extends FunctionSpec<
  RuntimeAndFunctionType.RuntimeAndFunctionType,
  FunctionVisibility,
  string,
  Schema.Schema.AnyNoContext,
  Schema.Schema.AnyNoContext
> {}

export interface AnyWithPropsWithRuntime<
  Runtime extends RuntimeAndFunctionType.Runtime,
> extends FunctionSpec<
  RuntimeAndFunctionType.WithRuntime<Runtime>,
  FunctionVisibility,
  string,
  Schema.Schema.AnyNoContext,
  Schema.Schema.AnyNoContext
> {}

export interface AnyWithPropsWithFunctionType<
  RuntimeAndFunctionType_ extends RuntimeAndFunctionType.RuntimeAndFunctionType,
> extends FunctionSpec<
  RuntimeAndFunctionType_,
  FunctionVisibility,
  string,
  Schema.Schema.AnyNoContext,
  Schema.Schema.AnyNoContext
> {}

export type GetRuntimeAndFunctionType<Function extends AnyWithProps> =
  Function["runtimeAndFunctionType"];

export type GetFunctionVisibility<Function extends AnyWithProps> =
  Function["functionVisibility"];

export type Name<Function extends AnyWithProps> = Function["name"];

export type Args<Function extends AnyWithProps> = Function["args"];

export type Returns<Function extends AnyWithProps> = Function["returns"];

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

export type WithoutName<
  Function extends AnyWithProps,
  Name_ extends Name<Function>,
> = Exclude<Function, { readonly name: Name_ }>;

export type RegisteredFunction<Function extends AnyWithProps> =
  RuntimeAndFunctionType.GetFunctionType<
    Function["runtimeAndFunctionType"]
  > extends "query"
    ? RegisteredQuery<
        GetFunctionVisibility<Function>,
        Args<Function>["Encoded"],
        Promise<Returns<Function>["Encoded"]>
      >
    : RuntimeAndFunctionType.GetFunctionType<
          Function["runtimeAndFunctionType"]
        > extends "mutation"
      ? RegisteredMutation<
          GetFunctionVisibility<Function>,
          Args<Function>["Encoded"],
          Promise<Returns<Function>["Encoded"]>
        >
      : RuntimeAndFunctionType.GetFunctionType<
            Function["runtimeAndFunctionType"]
          > extends "action"
        ? RegisteredAction<
            GetFunctionVisibility<Function>,
            Args<Function>["Encoded"],
            Promise<Returns<Function>["Encoded"]>
          >
        : never;

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
    Args_,
    Returns_
  > => {
    validateConfectFunctionIdentifier(name);

    return Object.assign(Object.create(Proto), {
      runtimeAndFunctionType,
      functionVisibility,
      name,
      args,
      returns,
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
