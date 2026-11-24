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
 * Convex resource limits for a nested call, including the number of documents
 * read, bytes read, and database queries.
 *
 * @category Configuration
 */
export type { TransactionLimits } from "convex/server";

/**
 * Options for limiting a nested query or mutation without changing the resource
 * limits of the enclosing transaction.
 *
 * @category Configuration
 */
export interface Options {
  /**
   * Maximum resource use for the nested call. Convex caps each requested limit
   * at the platform limit.
   *
   * @category Configuration
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
 * Backs transaction options on the generated runners. Pass `transactionLimits`
 * to `runQuery` on the yielded `QueryRunner` from `confect/_generated/services`
 * instead of requesting this capability directly.
 *
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
