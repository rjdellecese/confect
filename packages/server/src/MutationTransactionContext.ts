import * as Ref from "@confect/core/Ref";
import type {
  AdvancedRunQueryOptions,
  GenericDataModel,
  GenericMutationCtx,
} from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { Options as MutationOptions } from "./QueryTransactionContext";

/**
 * Convex's resource limits for an individual nested transaction call.
 *
 * @category Options
 */
export type { TransactionLimits } from "convex/server";
/**
 * Transaction-limit options accepted by a nested mutation.
 *
 * @category Options
 */
export type { Options as MutationOptions } from "./QueryTransactionContext";
/**
 * Nested-query options including transactionLimits and useStaleSnapshot.
 * Providing useStaleSnapshot, even false, requires a mutation context.
 *
 * @category Options
 */
export type QueryOptions = AdvancedRunQueryOptions;

const make = (
  ctx: Pick<GenericMutationCtx<GenericDataModel>, "runQuery" | "runMutation">,
) => ({
  runQuery: Effect.fn("MutationTransactionContext.runQuery")(
    <Query extends Ref.AnyQuery>(
      query: Query,
      args: Ref.Args<Query>,
      options: QueryOptions,
    ) =>
      Ref.runWithCodec(query, args, (ref, encodedArgs) =>
        ctx.runQuery(ref, encodedArgs, options),
      ),
  ),
  runMutation: Effect.fn("MutationTransactionContext.runMutation")(
    <Mutation extends Ref.AnyMutation>(
      mutation: Mutation,
      args: Ref.Args<Mutation>,
      options: MutationOptions,
    ) =>
      Ref.runWithCodec(mutation, args, (ref, encodedArgs) =>
        ctx.runMutation(ref, encodedArgs, options),
      ),
  ),
});

/**
 * @internal
 */
export class MutationTransactionContext extends Context.Service<
  MutationTransactionContext,
  ReturnType<typeof make>
>()("@confect/server/MutationTransactionContext") {}

/**
 * @internal
 */
export const layer = (
  ctx: Pick<GenericMutationCtx<GenericDataModel>, "runQuery" | "runMutation">,
) => Layer.succeed(MutationTransactionContext, make(ctx));
