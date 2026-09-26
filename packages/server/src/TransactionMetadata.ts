import type { QueryMeta } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export type { TransactionMetric, TransactionMetrics } from "convex/server";

const make = (meta: Pick<QueryMeta, "getTransactionMetrics">) => ({
  getMetrics: Effect.fn("TransactionMetadata.getMetrics")(() =>
    Effect.promise(() => meta.getTransactionMetrics()),
  ),
});

export class TransactionMetadata extends Context.Service<
  TransactionMetadata,
  ReturnType<typeof make>
>()("@confect/server/TransactionMetadata") {}

export const layer = (meta: Pick<QueryMeta, "getTransactionMetrics">) =>
  Layer.succeed(TransactionMetadata, make(meta));
