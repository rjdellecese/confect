import * as Ref from "@confect/core/Ref";
import { type GenericActionCtx } from "convex/server";
import type { ParseResult } from "effect";
import { Context, Effect, Layer, Match, Schema } from "effect";

const make =
  (runAction: GenericActionCtx<any>["runAction"]) =>
  <Action extends Ref.AnyAction>(
    action: Action,
    args: Ref.Args<Action>,
  ): Effect.Effect<Ref.Returns<Action>, ParseResult.ParseError> =>
    Effect.gen(function* () {
      const functionSpec = Ref.getFunctionSpec(action);
      const functionName = Ref.getConvexFunctionName(action);

      return yield* Match.value(functionSpec.functionProvenance).pipe(
        Match.tag("Confect", (confectFunctionSpec) =>
          Effect.gen(function* () {
            const encodedArgs = yield* Schema.encode(confectFunctionSpec.args)(
              args,
            );
            const encodedReturns = yield* Effect.promise(() =>
              runAction(functionName as any, encodedArgs),
            );
            return yield* Schema.decode(confectFunctionSpec.returns)(
              encodedReturns,
            );
          }),
        ),
        Match.tag("Convex", () =>
          Effect.promise(() => runAction(functionName as any, args as any)),
        ),
        Match.exhaustive,
      );
    });

export const ActionRunner = Context.GenericTag<ReturnType<typeof make>>(
  "@confect/server/ActionRunner",
);
export type ActionRunner = typeof ActionRunner.Identifier;

export const layer = (runAction: GenericActionCtx<any>["runAction"]) =>
  Layer.succeed(ActionRunner, make(runAction));
