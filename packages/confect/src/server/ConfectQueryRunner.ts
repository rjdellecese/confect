import { type GenericQueryCtx } from "convex/server";
import type { ParseResult } from "effect";
import { Context, Effect, Layer, Schema } from "effect";
import { ConfectApiRefs } from "../api";

const makeQueryRunner =
  (runQuery: GenericQueryCtx<any>["runQuery"]) =>
  <Query extends ConfectApiRefs.Ref.AnyQuery>(
    query: Query,
    args: ConfectApiRefs.Ref.Args<Query>["Type"],
  ): Effect.Effect<
    ConfectApiRefs.Ref.Returns<Query>["Type"],
    ParseResult.ParseError
  > =>
    Effect.gen(function* () {
      const function_ = ConfectApiRefs.getFunction(query);
      const functionName = ConfectApiRefs.getConvexFunctionName(query);

      const encodedArgs = yield* Schema.encode(function_.args)(args);
      const encodedReturns = yield* Effect.promise(() =>
        runQuery(functionName as any, encodedArgs),
      );
      return yield* Schema.decode(function_.returns)(encodedReturns);
    });

export const ConfectQueryRunner = Context.GenericTag<
  ReturnType<typeof makeQueryRunner>
>("@rjdellecese/confect/ConfectQueryRunner");
export type ConfectQueryRunner = typeof ConfectQueryRunner.Identifier;

export const layer = (runQuery: GenericQueryCtx<any>["runQuery"]) =>
  Layer.succeed(ConfectQueryRunner, makeQueryRunner(runQuery));
