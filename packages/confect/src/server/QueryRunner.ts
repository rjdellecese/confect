import { type GenericQueryCtx } from "convex/server";
import type { ParseResult } from "effect";
import { Context, Effect, Layer, Schema } from "effect";
import * as Refs from "../api/Refs";

const make =
  (runQuery: GenericQueryCtx<any>["runQuery"]) =>
  <Query extends Refs.Ref.AnyQuery>(
    query: Query,
    args: Refs.Ref.Args<Query>["Type"],
  ): Effect.Effect<Refs.Ref.Returns<Query>["Type"], ParseResult.ParseError> =>
    Effect.gen(function* () {
      const function_ = Refs.getFunction(query);
      const functionName = Refs.getConvexFunctionName(query);

      const encodedArgs = yield* Schema.encode(function_.args)(args);
      const encodedReturns = yield* Effect.promise(() =>
        runQuery(functionName as any, encodedArgs),
      );
      return yield* Schema.decode(function_.returns)(encodedReturns);
    });

export const QueryRunner = Context.GenericTag<ReturnType<typeof make>>(
  "@rjdellecese/confect/server/QueryRunner",
);
export type QueryRunner = typeof QueryRunner.Identifier;

export const layer = (runQuery: GenericQueryCtx<any>["runQuery"]) =>
  Layer.succeed(QueryRunner, make(runQuery));
