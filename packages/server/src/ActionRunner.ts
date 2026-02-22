import * as Ref from "@confect/core/Ref";
import { type GenericActionCtx } from "convex/server";
import type { ParseResult } from "effect";
import { Context, Effect, Layer, Schema } from "effect";

const makeActionRunner =
  (runAction: GenericActionCtx<any>["runAction"]) =>
  <Action extends Ref.AnyAction>(
    action: Action,
    args: Ref.Args<Action>["Type"],
  ): Effect.Effect<Ref.Returns<Action>["Type"], ParseResult.ParseError> =>
    Effect.gen(function* () {
      const function_ = Ref.getFunction(action);
      const functionName = Ref.getConvexFunctionName(action);

      const encodedArgs = yield* Schema.encode(function_.args)(args);
      const encodedReturns = yield* Effect.promise(() =>
        runAction(functionName as any, encodedArgs),
      );
      return yield* Schema.decode(function_.returns)(encodedReturns);
    });

export const ActionRunner = Context.GenericTag<
  ReturnType<typeof makeActionRunner>
>("@confect/server/ActionRunner");
export type ActionRunner = typeof ActionRunner.Identifier;

export const layer = (runAction: GenericActionCtx<any>["runAction"]) =>
  Layer.succeed(ActionRunner, makeActionRunner(runAction));
