import * as MiddlewareAttachment from "@confect/core/MiddlewareAttachment";
import type * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import * as Result from "effect/Result";
import type * as FunctionRegistryItem from "./FunctionRegistryItem";
import type * as MiddlewareRegistryItem from "./MiddlewareRegistryItem";

/**
 * A middleware spec paired with its implementation for one function's type—the resolved form `buildForGroup` hands to `makeRegisteredFunction`.
 */
export interface ResolvedMiddleware {
  readonly middlewareSpec: MiddlewareSpec.AnyMiddlewareSpec;
  readonly middlewareImpl: MiddlewareSpec.AnyMiddlewareImpl;
  readonly options?: unknown;
}

/**
 * Pair each middleware spec attached to a function with its registered
 * implementation for the function's type. Both misses are ruled out by the
 * type system (`GroupImpl.finalize` demands every attached middleware's
 * `MiddlewareImpl` service; `MiddlewareImpl.make`/`makeByFunctionType` cover exactly
 * the declared functionTypes, which `GroupSpec.middleware` requires to cover every
 * function). Spec identity is checked separately because implementation services
 * are keyed by string, so the type system cannot distinguish same-key specs.
 */
export const resolve = (
  functionRegistryItem: FunctionRegistryItem.ConfectFunctionRegistryItem,
  middlewareRegistryItems: ReadonlyMap<
    string,
    MiddlewareRegistryItem.MiddlewareRegistryItem
  >,
): ReadonlyArray<ResolvedMiddleware> => {
  Result.getOrThrowWith(
    MiddlewareAttachment.validateAll(
      functionRegistryItem.middlewareAttachments,
      `function "${functionRegistryItem.name}"`,
    ),
    (error) => new Error(MiddlewareAttachment.formatValidationError(error)),
  );
  return functionRegistryItem.middlewareAttachments.map(
    ({ spec: middlewareSpec, options }) => {
      const registered = middlewareRegistryItems.get(middlewareSpec.key);
      if (registered === undefined) {
        throw new Error(
          `Middleware "${middlewareSpec.key}" is attached to this group's spec, but no implementation was provided—pipe the group's impl through \`Layer.provide(MiddlewareImpl.make(...))\` (or \`makeByFunctionType\`/\`provides\`).`,
        );
      }
      if (registered.middlewareSpec !== middlewareSpec) {
        throw new Error(
          `Middleware "${middlewareSpec.key}" attached to function "${functionRegistryItem.name}" has an implementation registered for a different spec with the same key. Register the implementation using the attached middleware spec.`,
        );
      }

      const middlewareImpl =
        registered.impls[functionRegistryItem.functionType];
      if (middlewareImpl === undefined) {
        throw new Error(
          `Middleware "${middlewareSpec.key}" has no implementation for function type "${functionRegistryItem.functionType}", the type of function "${functionRegistryItem.name}". Declare the function type in the middleware's \`functionTypes\` and cover it in \`MiddlewareImpl.makeByFunctionType\`.`,
        );
      }

      return {
        middlewareImpl,
        middlewareSpec,
        options,
      };
    },
  );
};
