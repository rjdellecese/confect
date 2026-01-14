import type * as FunctionSpec from "@confect/core/FunctionSpec";
import { Predicate } from "effect";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as Handler from "./Handler";

export const TypeId = "@confect/server/RegistryItem";
export type TypeId = typeof TypeId;

export const isRegistryItem = (value: unknown): value is AnyWithProps =>
  Predicate.hasProperty(value, TypeId);

const RegistryItemProto = {
  [TypeId]: TypeId,
};

export interface RegistryItem<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
> {
  readonly [TypeId]: TypeId;
  readonly function_: FunctionSpec_;
  readonly handler: Handler.Handler<DatabaseSchema_, FunctionSpec_>;
}

export interface AnyWithProps {
  readonly [TypeId]: TypeId;
  readonly function_: FunctionSpec.AnyWithProps;
  readonly handler: Handler.AnyWithProps;
}

export const make = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
>({
  function_,
  handler,
}: {
  function_: FunctionSpec_;
  handler: Handler.Handler<DatabaseSchema_, FunctionSpec_>;
}): RegistryItem<DatabaseSchema_, FunctionSpec_> =>
  Object.assign(Object.create(RegistryItemProto), {
    function_,
    handler,
  });
