import type {
  FunctionType,
  FunctionVisibility,
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import type { Schema } from "effect";
import { Predicate } from "effect";
import { validateJsIdentifier } from "./internal/utils";

export const TypeId = "@confect/core/api/FunctionSpec";
export type TypeId = typeof TypeId;

export const isFunctionSpec = (u: unknown): u is AnyWithProps =>
  Predicate.hasProperty(u, TypeId);

export interface FunctionSpec<
  FunctionType_ extends FunctionType,
  FunctionVisibility_ extends FunctionVisibility,
  Name_ extends string,
  Args_ extends Schema.Schema.AnyNoContext,
  Returns_ extends Schema.Schema.AnyNoContext,
> {
  readonly [TypeId]: TypeId;
  readonly functionType: FunctionType_;
  readonly functionVisibility: FunctionVisibility_;
  readonly name: Name_;
  readonly args: Args_;
  readonly returns: Returns_;
}

export interface Any {
  readonly [TypeId]: TypeId;
}

export interface AnyWithProps
  extends FunctionSpec<
    FunctionType,
    FunctionVisibility,
    string,
    Schema.Schema.AnyNoContext,
    Schema.Schema.AnyNoContext
  > {}

export interface AnyWithPropsWithFunctionType<
  FunctionType_ extends FunctionType,
> extends FunctionSpec<
    FunctionType_,
    FunctionVisibility,
    string,
    Schema.Schema.AnyNoContext,
    Schema.Schema.AnyNoContext
  > {}

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
    FunctionType_ extends FunctionType,
    FunctionVisibility_ extends FunctionVisibility,
  >(
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
    FunctionType_,
    FunctionVisibility_,
    Name_,
    Args_,
    Returns_
  > => {
    validateJsIdentifier(name);

    return Object.assign(Object.create(Proto), {
      functionType,
      functionVisibility,
      name,
      args,
      returns,
    });
  };

export const internalQuery = make("query", "internal");
export const query = make("query", "public");

export const internalMutation = make("mutation", "internal");
export const mutation = make("mutation", "public");

export const internalAction = make("action", "internal");
export const action = make("action", "public");
