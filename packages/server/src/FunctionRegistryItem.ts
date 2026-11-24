import { fromPrototype } from "./internal/fromPrototype";
import type * as MiddlewareAttachment from "@confect/core/MiddlewareAttachment";
import type * as FunctionSpec from "@confect/core/FunctionSpec";
import * as Lazy from "@confect/core/Lazy";
import type {
  DefaultFunctionArgs,
  FunctionType,
  FunctionVisibility,
} from "convex/server";
import * as Match from "effect/Match";
import * as Predicate from "effect/Predicate";
import type * as Schema from "effect/Schema";
import type * as Handler from "./Handler";

/**
 * @internal
 */
export const TypeId = "~@confect/server/FunctionRegistryItem";
/**
 * @internal
 */
export type TypeId = typeof TypeId;

/**
 * @internal
 */
export const isFunctionRegistryItem = (value: unknown): value is AnyWithProps =>
  Predicate.hasProperty(value, TypeId);

const FunctionRegistryItemProto = {
  [TypeId]: TypeId,
} satisfies Pick<AnyWithProps, TypeId>;

/**
 * A function registered by `FunctionImpl.make`, one of two shapes keyed by the
 * spec's provenance.
 *
 * @internal
 */
export type AnyWithProps =
  | ConfectFunctionRegistryItem
  | ConvexFunctionRegistryItem;

/**
 * @internal
 */
export interface ConfectFunctionRegistryItem {
  readonly [TypeId]: TypeId;
  readonly _tag: "Confect";
  readonly name: string;
  readonly functionVisibility: FunctionVisibility;
  readonly functionType: FunctionType;
  readonly args: Schema.Codec<unknown, DefaultFunctionArgs>;
  readonly returns: Schema.Codec<unknown>;
  readonly error?: Schema.Codec<unknown>;
  readonly middlewareAttachments: ReadonlyArray<MiddlewareAttachment.MiddlewareAttachment>;
  readonly handler: Handler.AnyConfectProvenance;
}

/**
 * @internal
 */
export interface ConvexFunctionRegistryItem {
  readonly [TypeId]: TypeId;
  readonly _tag: "Convex";
  readonly handler: Handler.AnyConvexProvenance;
}

/**
 * @internal
 */
export const make = ({
  functionSpec,
  groupMiddlewareAttachments,
  handler,
}: {
  functionSpec: FunctionSpec.AnyWithProps;
  groupMiddlewareAttachments: ReadonlyArray<MiddlewareAttachment.MiddlewareAttachment>;
  handler: Handler.Any;
}): AnyWithProps =>
  Match.value(functionSpec.functionProvenance).pipe(
    Match.tag("Convex", (): AnyWithProps =>
      Object.assign(fromPrototype(FunctionRegistryItemProto), {
        _tag: "Convex" as const,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- FunctionImpl.make pairs the native handler with its Convex spec; narrowing provenance cannot narrow the separately stored handler.
        handler: handler as Handler.AnyConvexProvenance,
      }),
    ),
    Match.tag("Confect", (provenance): AnyWithProps => {
      const item = Object.assign(fromPrototype(FunctionRegistryItemProto), {
        _tag: "Confect" as const,
        name: functionSpec.name,
        functionVisibility: functionSpec.functionVisibility,
        functionType: functionSpec.runtimeAndFunctionType.functionType,
        middlewareAttachments: [
          ...groupMiddlewareAttachments,
          ...functionSpec.middlewareAttachments,
        ],
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- FunctionImpl.make pairs this Effect handler with its Confect spec; narrowing provenance cannot narrow the separately stored handler.
        handler: handler as Handler.AnyConfectProvenance,
      });

      Lazy.defineProperty(item, "args", () => provenance.args);
      Lazy.defineProperty(item, "returns", () => provenance.returns);
      if ("error" in provenance) {
        Lazy.defineProperty(item, "error", () => provenance.error);
      }

      return item;
    }),
    Match.exhaustive,
  );
