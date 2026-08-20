import type * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import type { FunctionType } from "convex/server";
import * as Predicate from "effect/Predicate";

export const TypeId = "@confect/server/MiddlewareRegistryItem";
export type TypeId = typeof TypeId;

export interface MiddlewareRegistryItem {
  readonly [TypeId]: TypeId;
  readonly middlewareSpec: MiddlewareSpec.AnyService;
  readonly impls: Partial<
    Record<FunctionType, MiddlewareSpec.AnyMiddlewareImpl>
  >;
}

export const isMiddlewareRegistryItem = (
  u: unknown,
): u is MiddlewareRegistryItem => Predicate.hasProperty(u, TypeId);

export const registryKey = (middlewareKey: string): string =>
  `middleware:${middlewareKey}`;
