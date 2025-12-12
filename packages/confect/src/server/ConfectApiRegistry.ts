import { Context, Record, Ref } from "effect";
import type * as ConfectApiBuilder from "./ConfectApiBuilder";

export interface HandlerItemRegistry {
  readonly [key: string]:
    | ConfectApiBuilder.Handlers.Item.AnyWithProps
    | HandlerItemRegistry;
}

export class ConfectApiRegistry extends Context.Reference<ConfectApiRegistry>()(
  "@rjdellecese/confect/ConfectApiRegistry",
  {
    defaultValue: () => Ref.unsafeMake(Record.empty() as HandlerItemRegistry),
  },
) {}
