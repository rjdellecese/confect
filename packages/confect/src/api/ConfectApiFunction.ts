import type { Schema } from "effect";
import { Predicate } from "effect";
import { validateJsIdentifier } from "../utils";

export const TypeId = "@rjdellecese/confect/ConfectApiFunction";
export type TypeId = typeof TypeId;

export const isConfectApiFunction = (
  u: unknown,
): u is ConfectApiFunction.AnyWithProps => Predicate.hasProperty(u, TypeId);

export interface ConfectApiFunction<
  FunctionType extends ConfectApiFunction.FunctionType,
  FunctionVisibility extends ConfectApiFunction.FunctionVisibility,
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

export declare namespace ConfectApiFunction {
  export interface AnyWithProps
    extends ConfectApiFunction<
      FunctionType,
      FunctionVisibility,
      string,
      Schema.Schema.AnyNoContext,
      Schema.Schema.AnyNoContext
    > {}

  interface AnyWithPropsWithFunctionType<FunctionType_ extends FunctionType>
    extends ConfectApiFunction<
      FunctionType_,
      FunctionVisibility,
      string,
      Schema.Schema.AnyNoContext,
      Schema.Schema.AnyNoContext
    > {}

  // TODO: Use type from convex-js?
  export type FunctionType = "Query" | "Mutation" | "Action";

  export type GetFunctionType<Function extends AnyWithProps> =
    Function extends ConfectApiFunction<
      infer FunctionType_,
      infer _FunctionVisibility,
      infer _Name,
      infer _Args,
      infer _Returns
    >
      ? FunctionType_
      : never;

  // TODO: Use type from convex-js?
  export type FunctionVisibility = "Public" | "Internal";

  export type GetFunctionVisibility<Function extends AnyWithProps> =
    Function extends ConfectApiFunction<
      infer _FunctionType,
      infer FunctionVisibility_,
      infer _Name,
      infer _Args,
      infer _Returns
    >
      ? FunctionVisibility_
      : never;

  export type Name<Function extends AnyWithProps> =
    Function extends ConfectApiFunction<
      infer _FunctionType,
      infer _FunctionVisibility,
      infer Name_,
      infer _Args,
      infer _Returns
    >
      ? Name_
      : never;

  export type Args<Function extends AnyWithProps> =
    Function extends ConfectApiFunction<
      infer _FunctionType,
      infer _FunctionVisibility,
      infer _Name,
      infer Args_,
      infer _Returns
    >
      ? Args_
      : never;

  export type Returns<Function extends AnyWithProps> =
    Function extends ConfectApiFunction<
      infer _FunctionType,
      infer _FunctionVisibility,
      infer _Name,
      infer _Args,
      infer Returns_
    >
      ? Returns_
      : never;

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
    Name_ extends string,
  > = Exclude<Function, { readonly name: Name_ }>;
}

const Proto = {
  [TypeId]: TypeId,
};

const make =
  <
    FunctionType extends ConfectApiFunction.FunctionType,
    FunctionVisibility extends ConfectApiFunction.FunctionVisibility,
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
  }): ConfectApiFunction<
    FunctionType,
    FunctionVisibility,
    Name,
    Args,
    Returns
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

export const internalQuery = make("Query", "Internal");
export const query = make("Query", "Public");

export const internalMutation = make("Mutation", "Internal");
export const mutation = make("Mutation", "Public");

export const internalAction = make("Action", "Internal");
export const action = make("Action", "Public");
