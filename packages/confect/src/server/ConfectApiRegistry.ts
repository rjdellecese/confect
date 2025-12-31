import { Context, Record, Ref } from "effect";
import type * as ConfectApiGroupImpl from "./ConfectApiGroupImpl";

export interface HandlerItemRegistry {
  readonly [key: string]:
    | ConfectApiGroupImpl.Handlers.Item.AnyWithProps
    | HandlerItemRegistry;
}

export class ConfectApiRegistry extends Context.Reference<ConfectApiRegistry>()(
  "@rjdellecese/confect/server/ConfectApiRegistry",
  {
    defaultValue: () => Ref.unsafeMake(Record.empty() as HandlerItemRegistry),
  },
) {}
