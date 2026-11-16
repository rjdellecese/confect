import * as Ref from "@confect/core/Ref";
import type {
  GenericDataModel,
  GenericQueryCtx,
  TransactionLimits,
} from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

/**
 * Convex's nested-call resource limits, including documents, bytes and queries.
 */
export type { TransactionLimits } from "convex/server";

/**
 * Transaction controls accepted by nested query and mutation calls.
 */
export interface Options {
  /**
   * Limits for the nested call; Convex caps them at platform limits.
   */
  readonly transactionLimits?: TransactionLimits;
}

const make = (ctx: Pick<GenericQueryCtx<GenericDataModel>, "runQuery">) => ({
  runQuery: Effect.fn("QueryTransactionContext.runQuery")(
    <Query extends Ref.AnyQuery>(
      query: Query,
      args: Ref.Args<Query>,
      options: Options,
    ) =>
      Ref.runWithCodec(query, args, (ref, encodedArgs) =>
        ctx.runQuery(ref, encodedArgs, options),
      ),
  ),
});

/**
 * @internal
 */
export class QueryTransactionContext extends Context.Service<
  QueryTransactionContext,
  ReturnType<typeof make>
>()("@confect/server/QueryTransactionContext") {}

/**
 * @internal
 */
export const layer = (
  ctx: Pick<GenericQueryCtx<GenericDataModel>, "runQuery">,
) => Layer.succeed(QueryTransactionContext, make(ctx));
