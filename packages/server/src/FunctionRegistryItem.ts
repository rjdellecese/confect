import type * as FunctionSpec from "@confect/core/FunctionSpec";
import * as Lazy from "@confect/core/Lazy";
import type * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import type { FunctionType, FunctionVisibility } from "convex/server";
import * as Match from "effect/Match";
import * as Predicate from "effect/Predicate";
import type * as Schema from "effect/Schema";
import type * as Handler from "./Handler";

export const TypeId = "~@confect/server/FunctionRegistryItem";
export type TypeId = typeof TypeId;

export const isFunctionRegistryItem = (value: unknown): value is AnyWithProps =>
  Predicate.hasProperty(value, TypeId);

const FunctionRegistryItemProto = {
  [TypeId]: TypeId,
};

/**
 * A function registered by `FunctionImpl.make`, one of two shapes keyed by
 * the spec's provenance.
 */
export type AnyWithProps =
  | ConfectFunctionRegistryItem
  | ConvexFunctionRegistryItem;

export interface ConfectFunctionRegistryItem {
  readonly [TypeId]: TypeId;
  readonly _tag: "Confect";
  readonly name: string;
  readonly functionVisibility: FunctionVisibility;
  readonly functionType: FunctionType;
  readonly args: Schema.Codec<any, any>;
  readonly returns: Schema.Codec<any, any>;
  readonly error?: Schema.Codec<any, any>;
  readonly middlewareSpecs: ReadonlyArray<MiddlewareSpec.AnyMiddlewareSpec>;
  readonly handler: Handler.AnyConfectProvenance;
}

export interface ConvexFunctionRegistryItem {
  readonly [TypeId]: TypeId;
  readonly _tag: "Convex";
  readonly handler: Handler.AnyConvexProvenance;
}

export const make = ({
  functionSpec,
  groupMiddlewareSpecs,
  handler,
}: {
  functionSpec: FunctionSpec.AnyWithProps;
  groupMiddlewareSpecs: ReadonlyArray<MiddlewareSpec.AnyMiddlewareSpec>;
  handler: Handler.Any;
}): AnyWithProps =>
  Match.value(functionSpec.functionProvenance).pipe(
    Match.tag("Convex", (): AnyWithProps =>
      Object.assign(Object.create(FunctionRegistryItemProto), {
        _tag: "Convex" as const,
        handler: handler as Handler.AnyConvexProvenance,
      }),
    ),
    Match.tag("Confect", (provenance): AnyWithProps => {
      const item = Object.assign(Object.create(FunctionRegistryItemProto), {
        _tag: "Confect" as const,
        name: functionSpec.name,
        functionVisibility: functionSpec.functionVisibility,
        functionType: functionSpec.runtimeAndFunctionType.functionType,
        middlewareSpecs: [
          ...groupMiddlewareSpecs,
          ...functionSpec.middlewareSpecs,
        ],
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
