import { type GenericActionCtx } from "convex/server";
import { Context, Effect, Layer, Schema } from "effect";
import * as Refs from "../api/Refs";

const makeActionRunner =
  (runAction: GenericActionCtx<any>["runAction"]) =>
  <Action extends Refs.AnyAction>(
    action: Action,
    args: Refs.Args<Action>["Type"],
  ) =>
    Effect.gen(function* () {
      const function_ = Refs.getFunction(action);
      const functionName = Refs.getConvexFunctionName(action);

      const encodedArgs = yield* Schema.encode(function_.args)(args);
      const encodedReturns = yield* Effect.promise(() =>
        runAction(functionName as any, encodedArgs),
      );
      return yield* Schema.decode(function_.returns)(encodedReturns);
    });

export const ActionRunner = Context.GenericTag<
  ReturnType<typeof makeActionRunner>
>("@rjdellecese/confect/server/ActionRunner");
export type ActionRunner = typeof ActionRunner.Identifier;

export const layer = (runAction: GenericActionCtx<any>["runAction"]) =>
  Layer.succeed(ActionRunner, makeActionRunner(runAction));
