import { Context, Ref } from "effect";
import type * as RegistryItem from "./RegistryItem";

export interface RegistryItems {
  readonly [key: string]: RegistryItem.AnyWithProps | RegistryItems;
}

export const Registry = Context.Reference<Ref.Ref<RegistryItems>>(
  "@confect/server/Registry",
  {
    defaultValue: () => Ref.makeUnsafe<RegistryItems>({}),
  },
);
export type Registry = Ref.Ref<RegistryItems>;
