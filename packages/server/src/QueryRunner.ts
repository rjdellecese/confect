import * as Ref from "@confect/core/Ref";
import { type GenericQueryCtx } from "convex/server";
import type { ParseResult } from "effect";
import { Context, Effect, Layer, Match, Schema } from "effect";

const make =
  (runQuery: GenericQueryCtx<any>["runQuery"]) =>
  <Query extends Ref.AnyQuery>(
    query: Query,
    args: Ref.Args<Query>,
  ): Effect.Effect<Ref.Returns<Query>, ParseResult.ParseError> =>
    Effect.gen(function* () {
      const functionSpec = Ref.getFunctionSpec(query);
      const functionName = Ref.getConvexFunctionName(query);

      return yield* Match.value(functionSpec.functionProvenance).pipe(
        Match.tag("Confect", (confectFunctionSpec) =>
          Effect.gen(function* () {
            const encodedArgs = yield* Schema.encode(confectFunctionSpec.args)(
              args,
            );
            const encodedReturns = yield* Effect.promise(() =>
              runQuery(functionName as any, encodedArgs),
            );
            return yield* Schema.decode(confectFunctionSpec.returns)(
              encodedReturns,
            );
          }),
        ),
        Match.tag("Convex", () =>
          Effect.promise(() => runQuery(functionName as any, args as any)),
        ),
        Match.exhaustive,
      );
    });

export const QueryRunner = Context.GenericTag<ReturnType<typeof make>>(
  "@confect/server/QueryRunner",
);
export type QueryRunner = typeof QueryRunner.Identifier;

export const layer = (runQuery: GenericQueryCtx<any>["runQuery"]) =>
  Layer.succeed(QueryRunner, make(runQuery));
