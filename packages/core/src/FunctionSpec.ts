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
import type * as Runtime from "./Runtime";

export const TypeId = "@confect/core/FunctionSpec";
export type TypeId = typeof TypeId;

export const isFunctionSpec = (u: unknown): u is AnyWithProps =>
  Predicate.hasProperty(u, TypeId);

export interface FunctionSpec<
  Runtime_ extends Runtime.Runtime,
  FunctionType_ extends Runtime.FunctionType<Runtime_>,
  FunctionVisibility_ extends FunctionVisibility,
  Name_ extends string,
  Args_ extends Schema.Schema.AnyNoContext,
  Returns_ extends Schema.Schema.AnyNoContext,
> {
  readonly [TypeId]: TypeId;
  readonly runtime: Runtime_;
  readonly functionType: FunctionType_;
  readonly functionVisibility: FunctionVisibility_;
  readonly name: Name_;
  readonly args: Args_;
  readonly returns: Returns_;
}

export interface Any {
  readonly [TypeId]: TypeId;
}

export interface AnyWithProps extends FunctionSpec<
  Runtime.Runtime,
  FunctionType,
  FunctionVisibility,
  string,
  Schema.Schema.AnyNoContext,
  Schema.Schema.AnyNoContext
> {}

export interface AnyWithPropsWithRuntime<
  Runtime_ extends Runtime.Runtime,
> extends FunctionSpec<
  Runtime_,
  Runtime.FunctionType<Runtime_>,
  FunctionVisibility,
  string,
  Schema.Schema.AnyNoContext,
  Schema.Schema.AnyNoContext
> {}

export interface AnyWithPropsWithFunctionType<
  Runtime_ extends Runtime.Runtime,
  FunctionType_ extends Runtime.FunctionType<Runtime_>,
> extends FunctionSpec<
  Runtime_,
  FunctionType_,
  FunctionVisibility,
  string,
  Schema.Schema.AnyNoContext,
  Schema.Schema.AnyNoContext
> {}

export type GetRuntime<Function extends AnyWithProps> = Function["runtime"];

export type GetFunctionType<Function extends AnyWithProps> =
  Function["functionType"];

export type GetFunctionVisibility<Function extends AnyWithProps> =
  Function["functionVisibility"];

export type Name<Function extends AnyWithProps> = Function["name"];

export type Args<Function extends AnyWithProps> = Function["args"];

export type Returns<Function extends AnyWithProps> = Function["returns"];

export type WithName<
  Function extends AnyWithProps,
  Name_ extends string,
> = Extract<Function, { readonly name: Name_ }>;

export type WithFunctionType<
  Function extends AnyWithProps,
  FunctionType_ extends FunctionType,
> = Extract<Function, { readonly functionType: FunctionType_ }>;

export type ExcludeName<
  Function extends AnyWithProps,
  Name_ extends Name<Function>,
> = Exclude<Function, { readonly name: Name_ }>;

export type RegisteredFunction<Function extends AnyWithProps> =
  Function["functionType"] extends "query"
    ? RegisteredQuery<
        GetFunctionVisibility<Function>,
        Args<Function>["Encoded"],
        Promise<Returns<Function>["Encoded"]>
      >
    : Function["functionType"] extends "mutation"
      ? RegisteredMutation<
          GetFunctionVisibility<Function>,
          Args<Function>["Encoded"],
          Promise<Returns<Function>["Encoded"]>
        >
      : Function["functionType"] extends "action"
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
    Runtime_ extends Runtime.Runtime,
    FunctionType_ extends Runtime.FunctionType<Runtime_>,
    FunctionVisibility_ extends FunctionVisibility,
  >(
    runtime: Runtime_,
    functionType: FunctionType_,
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
    Runtime_,
    FunctionType_,
    FunctionVisibility_,
    Name_,
    Args_,
    Returns_
  > => {
    validateConfectFunctionIdentifier(name);

    return Object.assign(Object.create(Proto), {
      runtime,
      functionType,
      functionVisibility,
      name,
      args,
      returns,
    });
  };

export const publicQuery = make("Convex", "query", "public");
export const internalQuery = make("Convex", "query", "internal");
export const publicMutation = make("Convex", "mutation", "public");
export const internalMutation = make("Convex", "mutation", "internal");
export const publicAction = make("Convex", "action", "public");
export const internalAction = make("Convex", "action", "internal");

export const publicNodeAction = make("Node", "action", "public");
export const internalNodeAction = make("Node", "action", "internal");
