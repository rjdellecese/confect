import type { Schema } from "effect";
import { Predicate } from "effect";
import { validateJsIdentifier } from "../internal/utils";
import type {
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";

export const TypeId = "@rjdellecese/confect/api/FunctionSpec";
export type TypeId = typeof TypeId;

export const isFunctionSpec = (u: unknown): u is FunctionSpec.AnyWithProps =>
  Predicate.hasProperty(u, TypeId);

export interface FunctionSpec<
  FunctionType extends FunctionSpec.FunctionType,
  FunctionVisibility extends FunctionSpec.FunctionVisibility,
  Name extends string,
  Args extends Schema.Schema.AnyNoContext,
  Returns extends Schema.Schema.AnyNoContext,
> {
  readonly [TypeId]: TypeId;
  readonly functionType: FunctionType;
  readonly functionVisibility: FunctionVisibility;
  readonly name: Name;
  readonly args: Args;
  readonly returns: Returns;
}

export declare namespace FunctionSpec {
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

  interface AnyWithPropsWithFunctionType<FunctionType_ extends FunctionType>
    extends FunctionSpec<
      FunctionType_,
      FunctionVisibility,
      string,
      Schema.Schema.AnyNoContext,
      Schema.Schema.AnyNoContext
    > {}

  // TODO: Use type from convex-js?
  export type FunctionType = "Query" | "Mutation" | "Action";

  export type GetFunctionType<Function extends AnyWithProps> =
    Function["functionType"];

  // TODO: Use type from convex-js?
  export type FunctionVisibility = "Public" | "Internal";

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

  export type RegisteredFunction<Function extends FunctionSpec.AnyWithProps> =
    Function["functionType"] extends "Query"
      ? RegisteredQuery<
          Lowercase<GetFunctionVisibility<Function>>,
          Args<Function>["Encoded"],
          Promise<Returns<Function>["Encoded"]>
        >
      : Function["functionType"] extends "Mutation"
        ? RegisteredMutation<
            Lowercase<GetFunctionVisibility<Function>>,
            Args<Function>["Encoded"],
            Promise<Returns<Function>["Encoded"]>
          >
        : Function["functionType"] extends "Action"
          ? RegisteredAction<
              Lowercase<GetFunctionVisibility<Function>>,
              Args<Function>["Encoded"],
              Promise<Returns<Function>["Encoded"]>
            >
          : never;
}

const Proto = {
  [TypeId]: TypeId,
};

const make =
  <
    FunctionType extends FunctionSpec.FunctionType,
    FunctionVisibility extends FunctionSpec.FunctionVisibility,
  >(
    functionType: FunctionType,
    functionVisibility: FunctionVisibility,
  ) =>
  <
    const Name extends string,
    Args extends Schema.Schema.AnyNoContext,
    Returns extends Schema.Schema.AnyNoContext,
  >({
    name,
    args,
    returns,
  }: {
    name: Name;
    args: Args;
    returns: Returns;
  }): FunctionSpec<FunctionType, FunctionVisibility, Name, Args, Returns> => {
    validateJsIdentifier(name);

    return Object.assign(Object.create(Proto), {
      functionType,
      functionVisibility,
      name,
      args,
      returns,
    });
  };

export const internalQuery = make("Query", "Internal");
export const query = make("Query", "Public");

export const internalMutation = make("Mutation", "Internal");
export const mutation = make("Mutation", "Public");

export const internalAction = make("Action", "Internal");
export const action = make("Action", "Public");
