import { Context, Ref } from "effect";

/**
 * Recursive tree that mirrors a `Spec`'s group structure. Leaves are the
 * per-function items written by each `FunctionImpl`'s layer initializer. The
 * leaf type is intentionally `unknown` here so `@confect/core` does not need
 * to know about `@confect/server`'s `RegistryItem` shape; producers and
 * consumers (the server runtime and the CLI's `implValidation`) narrow as
 * needed.
 */
export interface RegistryItems {
  readonly [key: string]: unknown | RegistryItems;
}

/**
 * Effect `Context.Reference` keyed by `@confect/core/Registry`. Lives in
 * `@confect/core` so `@confect/server` (which writes to it from
 * `FunctionImpl` initializers and reads it from `RegisteredFunctions`) and
 * `@confect/cli` (which inspects it during impl validation) can share the
 * exact same `Ref` instance by importing the same tag — without relying on
 * Effect's global default-value cache to align two separately-defined tags
 * by string key.
 */
export class Registry extends Context.Reference<Registry>()(
  "@confect/core/Registry",
  {
    defaultValue: () => Ref.unsafeMake<RegistryItems>({}),
  },
) {}
