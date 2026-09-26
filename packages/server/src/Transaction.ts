import type { QueryMeta } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export type { TransactionMetric, TransactionMetrics } from "convex/server";

const make = (meta: Pick<QueryMeta, "getTransactionMetrics">) => ({
  getMetrics: Effect.fn("Transaction.getMetrics")(() =>
    Effect.promise(() => meta.getTransactionMetrics()),
  ),
});

export class Transaction extends Context.Service<
  Transaction,
  ReturnType<typeof make>
>()("@confect/server/Transaction") {}

export const layer = (meta: Pick<QueryMeta, "getTransactionMetrics">) =>
  Layer.succeed(Transaction, make(meta));
