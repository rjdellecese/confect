import * as Ref from "@confect/core/Ref";
import { type GenericQueryCtx } from "convex/server";
import { Context, Layer } from "effect";

const make =
  (runQuery: GenericQueryCtx<any>["runQuery"]) =>
  <Query extends Ref.AnyQuery>(query: Query, args: Ref.Args<Query>) =>
    Ref.runWithCodec(query, args, (functionReference, encodedArgs) =>
      runQuery(functionReference, encodedArgs),
    );

export const QueryRunner = Context.GenericTag<ReturnType<typeof make>>(
  "@confect/server/QueryRunner",
);
export type QueryRunner = typeof QueryRunner.Identifier;

export const layer = (runQuery: GenericQueryCtx<any>["runQuery"]) =>
  Layer.succeed(QueryRunner, make(runQuery));
