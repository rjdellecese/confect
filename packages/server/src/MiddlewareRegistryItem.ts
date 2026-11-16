import type * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import type { FunctionType } from "convex/server";
import * as Predicate from "effect/Predicate";

/**
 * @internal
 */
export const TypeId = "~@confect/server/MiddlewareRegistryItem";
/**
 * @internal
 */
export type TypeId = typeof TypeId;

/**
 * @internal
 */
export interface MiddlewareRegistryItem {
  readonly [TypeId]: TypeId;
  readonly middlewareSpec: MiddlewareSpec.AnyMiddlewareSpec;
  readonly impls: Partial<
    Record<FunctionType, MiddlewareSpec.AnyMiddlewareImpl>
  >;
}

/**
 * @internal
 */
export const isMiddlewareRegistryItem = (
  u: unknown,
): u is MiddlewareRegistryItem => Predicate.hasProperty(u, TypeId);

/**
 * @internal
 */
export const registryKey = (middlewareKey: string): string =>
  `middleware:${middlewareKey}`;
