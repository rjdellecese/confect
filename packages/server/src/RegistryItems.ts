import type * as MiddlewareKey from "@confect/core/MiddlewareKey";
import * as Array from "effect/Array";
import { pipe } from "effect/Function";
import * as Record from "effect/Record";
import * as FunctionRegistryItem from "./FunctionRegistryItem";
import * as MiddlewareRegistryItem from "./MiddlewareRegistryItem";

/**
 * Recursive tree that mirrors a `Spec`'s group structure. Leaves are the
 * per-function items written by each `FunctionImpl`'s layer initializer. The
 * leaf type is intentionally `unknown` so producers and consumers (the
 * server runtime and the CLI's impl validation) narrow as needed.
 */
export interface RegistryItems {
  readonly [key: string]: unknown | RegistryItems;
}

/**
 * The names of the function-shaped entries in a group's (flat, isolated)
 * registry. `FunctionImpl.make` registers each function under a
 * single-segment key, so the registry built for one group contains exactly
 * that group's functions at the top level.
 */
export const functionNames = (items: RegistryItems): ReadonlyArray<string> =>
  pipe(
    Record.toEntries(items),
    Array.filter(([, value]) =>
      FunctionRegistryItem.isFunctionRegistryItem(value),
    ),
    Array.map(([name]) => name),
  );

/**
 * The keys of the middleware implementations registered into a group's
 * registry (stored under `middleware:<key>` entries by `MiddlewareImpl`).
 */
export const middlewareKeys = (
  items: RegistryItems,
): ReadonlyArray<MiddlewareKey.MiddlewareKey> =>
  pipe(
    Record.values(items),
    Array.filter(MiddlewareRegistryItem.isMiddlewareRegistryItem),
    Array.map((item) => item.middlewareSpec.key),
  );
