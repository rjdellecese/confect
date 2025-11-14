import { Effect, Record, Ref } from "effect";
import * as ConfectApiBuilder from "./ConfectApiBuilder";

// TODO: Rewrite to be synchronous using Context.Reference
export class ConfectApiRegistry extends Effect.Service<ConfectApiRegistry>()(
  "@rjdellecese/confect/ConfectApiRegistry",
  {
    effect: Effect.gen(function* () {
      const handlerItemsRef = yield* Ref.make(
        Record.empty<string, ConfectApiBuilder.Handlers.Item.AnyWithProps>()
      );

      return {
        add: (
          functionPath: string,
          handlerItem: ConfectApiBuilder.Handlers.Item.AnyWithProps
        ): Effect.Effect<void> =>
          Ref.getAndUpdate(
            handlerItemsRef,
            Record.set(functionPath, handlerItem)
          ),
        handlerItems: Ref.get(handlerItemsRef),
      };
    }),
  }
) {}
