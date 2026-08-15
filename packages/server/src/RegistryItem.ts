import type * as FunctionSpec from "@confect/core/FunctionSpec";
import type * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import * as Predicate from "effect/Predicate";
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
  readonly functionSpec: FunctionSpec_;
  readonly middlewareSpecs: ReadonlyArray<MiddlewareSpec.AnyService>;
  readonly handler: Handler.Handler<DatabaseSchema_, FunctionSpec_>;
}

export interface AnyWithProps {
  readonly [TypeId]: TypeId;
  readonly functionSpec: FunctionSpec.AnyWithProps;
  readonly middlewareSpecs: ReadonlyArray<MiddlewareSpec.AnyService>;
  readonly handler: Handler.Any;
}

/**
 * A middleware spec paired with its implementation for one function's type —
 * the resolved form `buildForGroup` hands to `makeRegisteredFunction`.
 */
export interface ResolvedMiddleware {
  readonly middlewareSpec: MiddlewareSpec.AnyService;
  readonly middlewareImpl: MiddlewareSpec.AnyMiddleware;
}

export const make = ({
  functionSpec,
  handler,
  middlewareSpecs,
}: {
  functionSpec: FunctionSpec.AnyWithProps;
  handler: AnyWithProps["handler"];
  middlewareSpecs: AnyWithProps["middlewareSpecs"];
}): AnyWithProps =>
  Object.assign(Object.create(RegistryItemProto), {
    functionSpec,
    handler,
    middlewareSpecs,
  });
