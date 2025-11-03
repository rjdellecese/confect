import { Effect, HashMap, Ref } from "effect";
import * as ConfectApiBuilder from "./ConfectApiBuilder";

export class ConfectApiRegistry extends Effect.Service<ConfectApiRegistry>()(
  "@rjdellecese/confect/ConfectApiRegistry",
  {
    effect: Effect.gen(function* () {
      const registeredFunctionsRef = yield* Ref.make(
        HashMap.empty<string, ConfectApiBuilder.Handlers.Item.AnyWithProps>()
      );

      return {
        add: (
          functionPath: string,
          handlerItem: ConfectApiBuilder.Handlers.Item.AnyWithProps
        ): Effect.Effect<void> =>
          Ref.getAndUpdate(
            registeredFunctionsRef,
            HashMap.set(functionPath, handlerItem)
          ),
        unsafeGet: (
          functionPath: string
        ): Effect.Effect<ConfectApiBuilder.Handlers.Item.AnyWithProps> =>
          Ref.get(registeredFunctionsRef).pipe(
            Effect.map(HashMap.unsafeGet(functionPath))
          ),
        registeredFunctions: Ref.get(registeredFunctionsRef),
      };
    }),
  }
) {}
