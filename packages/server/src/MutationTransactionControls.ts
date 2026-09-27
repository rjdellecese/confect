import * as Ref from "@confect/core/Ref";
import type {
  AdvancedRunQueryOptions,
  GenericDataModel,
  GenericMutationCtx,
} from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { Options as MutationOptions } from "./QueryTransactionControls";

export type { TransactionLimits } from "convex/server";
export type { Options as MutationOptions } from "./QueryTransactionControls";
export type QueryOptions = AdvancedRunQueryOptions;

const make = (
  ctx: Pick<GenericMutationCtx<GenericDataModel>, "runQuery" | "runMutation">,
) => ({
  runQuery: Effect.fn("MutationTransactionControls.runQuery")(
    <Query extends Ref.AnyQuery>(
      query: Query,
      args: Ref.Args<Query>,
      options: QueryOptions,
    ) =>
      Ref.runWithCodec(query, args, (ref, encodedArgs) =>
        ctx.runQuery(ref, encodedArgs, options),
      ),
  ),
  runMutation: Effect.fn("MutationTransactionControls.runMutation")(
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

export class MutationTransactionControls extends Context.Service<
  MutationTransactionControls,
  ReturnType<typeof make>
>()("@confect/server/MutationTransactionControls") {}

export const layer = (
  ctx: Pick<GenericMutationCtx<GenericDataModel>, "runQuery" | "runMutation">,
) => Layer.succeed(MutationTransactionControls, make(ctx));
