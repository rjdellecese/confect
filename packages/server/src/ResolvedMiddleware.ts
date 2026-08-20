import type * as MiddlewareSpec from "@confect/core/MiddlewareSpec";

/**
 * A middleware spec paired with its implementation for one function's type —
 * the resolved form `buildForGroup` hands to `makeRegisteredFunction`.
 */
export interface ResolvedMiddleware {
  readonly middlewareSpec: MiddlewareSpec.AnyMiddlewareSpec;
  readonly middlewareImpl: MiddlewareSpec.AnyMiddlewareImpl;
}
