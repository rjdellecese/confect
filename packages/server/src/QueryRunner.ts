import * as Ref from "@confect/core/Ref";
import { type GenericQueryCtx } from "convex/server";
import type { ParseResult, Effect } from "effect";
import { Context, Layer } from "effect";

const make =
  (runQuery: GenericQueryCtx<any>["runQuery"]) =>
  <Query extends Ref.AnyQuery>(
    query: Query,
    ...args: Ref.OptionalArgs<Query>
  ): Effect.Effect<
    Ref.Returns<Query>,
    Ref.Error<Query> | ParseResult.ParseError
  > =>
    Ref.runWithCodec(
      query,
      (args[0] ?? {}) as Ref.Args<Query>,
      (functionReference, encodedArgs) =>
        runQuery(functionReference, encodedArgs),
    );

export const QueryRunner = Context.GenericTag<ReturnType<typeof make>>(
  "@confect/server/QueryRunner",
);
export type QueryRunner = typeof QueryRunner.Identifier;

export const layer = (runQuery: GenericQueryCtx<any>["runQuery"]) =>
  Layer.succeed(QueryRunner, make(runQuery));
