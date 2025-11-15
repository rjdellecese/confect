import { Context, Record, Ref } from "effect";
import * as ConfectApiBuilder from "./ConfectApiBuilder";

export class ConfectApiRegistry extends Context.Reference<ConfectApiRegistry>()(
  "@rjdellecese/confect/ConfectApiRegistry",
  {
    defaultValue: () =>
      Ref.unsafeMake(
        Record.empty<string, ConfectApiBuilder.Handlers.Item.AnyWithProps>()
      ),
  }
) {}
