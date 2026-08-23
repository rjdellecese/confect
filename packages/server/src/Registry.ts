import * as Context from "effect/Context";
import * as Ref from "effect/Ref";
import type { RegistryItems } from "./RegistryItems";

/**
 * Effect `Context.Reference` shared by everything that touches a group's
 * registry — `FunctionImpl`/`MiddlewareImpl` initializers write to it,
 * `RegisteredFunctions` reads it, and the CLI's impl validation inspects it
 * — all through this one tag, without relying on Effect's global
 * default-value cache to align separately-defined tags by string key.
 */
export const Registry = Context.Reference<Ref.Ref<RegistryItems>>(
  "@confect/server/Registry",
  {
    defaultValue: () => Ref.makeUnsafe<RegistryItems>({}),
  },
);
