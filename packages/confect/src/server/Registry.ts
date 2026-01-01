import { Context, Ref } from "effect";
import type * as RegistryItem from "./RegistryItem";

export interface RegistryItems {
  readonly [key: string]:
    | RegistryItem.RegistryItem.AnyWithProps
    | RegistryItems;
}

export class Registry extends Context.Reference<Registry>()(
  "@rjdellecese/confect/server/Registry",
  {
    defaultValue: () => Ref.unsafeMake<RegistryItems>({}),
  },
) {}
