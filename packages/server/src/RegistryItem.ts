import type * as FunctionSpec from "@confect/core/FunctionSpec";
import type * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import * as Match from "effect/Match";
import * as Predicate from "effect/Predicate";
import type * as Handler from "./Handler";

export const TypeId = "@confect/server/RegistryItem";
export type TypeId = typeof TypeId;

export const isRegistryItem = (value: unknown): value is AnyWithProps =>
  Predicate.hasProperty(value, TypeId);

const RegistryItemProto = {
  [TypeId]: TypeId,
};

/**
 * A function registered by `FunctionImpl.make`, one of two shapes keyed by
 * the spec's provenance. Only the `Confect` arm carries covering middleware —
 * a plain Convex function's raw registered handler passes through Confect
 * untouched, so the pairing (Convex item, covering middleware) is
 * unrepresentable.
 */
export type AnyWithProps = ConfectRegistryItem | ConvexRegistryItem;

export interface ConfectRegistryItem {
  readonly [TypeId]: TypeId;
  readonly _tag: "Confect";
  readonly functionSpec: FunctionSpec.AnyConfect;
  readonly middlewareSpecs: ReadonlyArray<MiddlewareSpec.AnyService>;
  readonly handler: Handler.AnyConfectProvenance;
}

export interface ConvexRegistryItem {
  readonly [TypeId]: TypeId;
  readonly _tag: "Convex";
  readonly functionSpec: FunctionSpec.AnyConvex;
  readonly handler: Handler.AnyConvexProvenance;
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
  handler: Handler.Any;
  /** The middleware covering this function. */
  middlewareSpecs: ReadonlyArray<MiddlewareSpec.AnyService>;
}): AnyWithProps =>
  Match.value(functionSpec.functionProvenance).pipe(
    Match.tag("Convex", (): AnyWithProps =>
      Object.assign(Object.create(RegistryItemProto), {
        _tag: "Convex" as const,
        functionSpec: functionSpec as FunctionSpec.AnyConvex,
        handler: handler as Handler.AnyConvexProvenance,
      }),
    ),
    Match.tag("Confect", (): AnyWithProps =>
      Object.assign(Object.create(RegistryItemProto), {
        _tag: "Confect" as const,
        functionSpec: functionSpec as FunctionSpec.AnyConfect,
        middlewareSpecs,
        handler: handler as Handler.AnyConfectProvenance,
      }),
    ),
    Match.exhaustive,
  );
