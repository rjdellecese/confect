import type * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import type * as FunctionRegistryItem from "./FunctionRegistryItem";
import type * as MiddlewareRegistryItem from "./MiddlewareRegistryItem";

/**
 * A middleware spec paired with its implementation for one function's type —
 * the resolved form `buildForGroup` hands to `makeRegisteredFunction`.
 */
export interface ResolvedMiddleware {
  readonly middlewareSpec: MiddlewareSpec.AnyMiddlewareSpec;
  readonly middlewareImpl: MiddlewareSpec.AnyMiddlewareImpl;
}

/**
 * Pair each middleware spec attached to a function with its registered
 * implementation for the function's type. Both misses are ruled out by the
 * type system (`GroupImpl.finalize` demands every attached middleware's
 * `MiddlewareImpl` service; `MiddlewareImpl.make`/`makeByFunctionType` cover exactly
 * the declared functionTypes, which `GroupSpec.middleware` requires to cover every
 * function) — these throws are the runtime backstop for builds that ignored
 * type errors.
 */
export const resolve = (
  functionRegistryItem: FunctionRegistryItem.ConfectFunctionRegistryItem,
  middlewareRegistryItems: ReadonlyMap<
    string,
    MiddlewareRegistryItem.MiddlewareRegistryItem
  >,
): ReadonlyArray<ResolvedMiddleware> =>
  functionRegistryItem.middlewareSpecs.map((middlewareSpec) => {
    const registered = middlewareRegistryItems.get(middlewareSpec.key);
    if (registered === undefined) {
      throw new Error(
        `Middleware "${middlewareSpec.key}" is attached to this group's spec, but no implementation was provided — pipe the group's impl through \`Layer.provide(MiddlewareImpl.make(...))\` (or \`makeByFunctionType\`/\`provides\`).`,
      );
    }

    const middlewareImpl = registered.impls[functionRegistryItem.functionType];
    if (middlewareImpl === undefined) {
      throw new Error(
        `Middleware "${middlewareSpec.key}" has no implementation for function type "${functionRegistryItem.functionType}", the type of function "${functionRegistryItem.name}". Declare the function type in the middleware's \`functionTypes\` and cover it in \`MiddlewareImpl.makeByFunctionType\`.`,
      );
    }

    return { middlewareImpl, middlewareSpec };
  });
