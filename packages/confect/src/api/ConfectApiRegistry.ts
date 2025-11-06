import { Effect, Record, Ref } from "effect";
import * as ConfectApiBuilder from "./ConfectApiBuilder";

export class ConfectApiRegistry extends Effect.Service<ConfectApiRegistry>()(
  "@rjdellecese/confect/ConfectApiRegistry",
  {
    effect: Effect.gen(function* () {
      const registeredFunctionsRef = yield* Ref.make(
        Record.empty<string, ConfectApiBuilder.Handlers.Item.AnyWithProps>()
      );

      return {
        add: (
          functionPath: string,
          handlerItem: ConfectApiBuilder.Handlers.Item.AnyWithProps
        ): Effect.Effect<void> =>
          Ref.getAndUpdate(
            registeredFunctionsRef,
            Record.set(functionPath, handlerItem)
          ),
        registeredFunctions: Ref.get(registeredFunctionsRef),
      };
    }),
  }
) {}
