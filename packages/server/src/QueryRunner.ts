import * as Ref from "@confect/core/Ref";
import { type GenericQueryCtx } from "convex/server";
import type { ParseResult } from "effect";
import { Context, Effect, Layer } from "effect";

const make =
  (runQuery: GenericQueryCtx<any>["runQuery"]) =>
  <Query extends Ref.AnyQuery>(
    query: Query,
    args: Ref.Args<Query>,
  ): Effect.Effect<Ref.Returns<Query>, ParseResult.ParseError> =>
    Ref.runWithCodec(query, args, (functionName, encodedArgs) =>
      Effect.promise(() => runQuery(functionName as any, encodedArgs)),
    );

export const QueryRunner = Context.GenericTag<ReturnType<typeof make>>(
  "@confect/server/QueryRunner",
);
export type QueryRunner = typeof QueryRunner.Identifier;

export const layer = (runQuery: GenericQueryCtx<any>["runQuery"]) =>
  Layer.succeed(QueryRunner, make(runQuery));
