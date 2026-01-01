import { Context, Record, Ref } from "effect";
import type * as ConfectApiRegistryItem from "./ConfectApiRegistryItem";

export interface ConfectApiRegistryItems {
  readonly [key: string]:
    | ConfectApiRegistryItem.ConfectApiRegistryItem.AnyWithProps
    | ConfectApiRegistryItems;
}

export class ConfectApiRegistry extends Context.Reference<ConfectApiRegistry>()(
  "@rjdellecese/confect/server/ConfectApiRegistry",
  {
    defaultValue: () =>
      Ref.unsafeMake(Record.empty() as ConfectApiRegistryItems),
  },
) {}
