import type * as FunctionSpec from "@confect/core/FunctionSpec";
import * as Lazy from "@confect/core/Lazy";
import type * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import type { FunctionType, FunctionVisibility } from "convex/server";
import * as Match from "effect/Match";
import * as Predicate from "effect/Predicate";
import type * as Schema from "effect/Schema";
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
 * the spec's provenance. `ConfectRegistryItem` carries the aspects of the
 * spec the registration path uses plus the covering middleware;
 * `ConvexRegistryItem` carries only the raw registered handler, which passes
 * through Confect untouched — so the pairing (Convex item, covering
 * middleware) is unrepresentable.
 */
export type AnyWithProps = ConfectRegistryItem | ConvexRegistryItem;

export interface ConfectRegistryItem {
  readonly [TypeId]: TypeId;
  readonly _tag: "Confect";
  readonly name: string;
  readonly functionVisibility: FunctionVisibility;
  readonly functionType: FunctionType;
  readonly args: Schema.Codec<any, any>;
  readonly returns: Schema.Codec<any, any>;
  /**
   * The function's declared error schema. Installed as a lazy memoised
   * property only when the spec declares one, so `"error" in item` checks
   * presence without building the schema — the same shape as the spec's
   * provenance and `Ref`.
   */
  readonly error?: Schema.Codec<any, any>;
  /**
   * The middleware covering this function: group-attached first (in
   * attachment order, outermost), then the function's own.
   */
  readonly middlewareSpecs: ReadonlyArray<MiddlewareSpec.AnyService>;
  readonly handler: Handler.AnyConfectProvenance;
}

export interface ConvexRegistryItem {
  readonly [TypeId]: TypeId;
  readonly _tag: "Convex";
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
        handler: handler as Handler.AnyConvexProvenance,
      }),
    ),
    Match.tag("Confect", (provenance): AnyWithProps => {
      const item = Object.assign(Object.create(RegistryItemProto), {
        _tag: "Confect" as const,
        name: functionSpec.name,
        functionVisibility: functionSpec.functionVisibility,
        functionType: functionSpec.runtimeAndFunctionType.functionType,
        middlewareSpecs,
        handler: handler as Handler.AnyConfectProvenance,
      });

      Lazy.defineProperty(item, "args", () => provenance.args);
      Lazy.defineProperty(item, "returns", () => provenance.returns);
      if ("error" in provenance) {
        Lazy.defineProperty(item, "error", () => provenance.error);
      }

      return item as AnyWithProps;
    }),
    Match.exhaustive,
  );
