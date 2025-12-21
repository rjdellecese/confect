import { type GenericActionCtx } from "convex/server";
import { Context, Effect, Layer, Schema } from "effect";
import { ConfectApiRefs } from "../api";

const makeActionRunner =
  (runAction: GenericActionCtx<any>["runAction"]) =>
  <Action extends ConfectApiRefs.Ref.AnyAction>(
    action: Action,
    args: ConfectApiRefs.Ref.Args<Action>["Type"],
  ) =>
    Effect.gen(function* () {
      const function_ = ConfectApiRefs.getFunction(action);
      const functionName = ConfectApiRefs.getConvexFunctionName(action);

      const encodedArgs = yield* Schema.encode(function_.args)(args);
      const encodedReturns = yield* Effect.promise(() =>
        runAction(functionName as any, encodedArgs),
      );
      return yield* Schema.decode(function_.returns)(encodedReturns);
    });

export const ConfectActionRunner = Context.GenericTag<
  ReturnType<typeof makeActionRunner>
>("@rjdellecese/confect/server/ConfectActionRunner");
export type ConfectActionRunner = typeof ConfectActionRunner.Identifier;

export const layer = (runAction: GenericActionCtx<any>["runAction"]) =>
  Layer.succeed(ConfectActionRunner, makeActionRunner(runAction));
