import type { QueryMeta } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export type { TransactionMetric, TransactionMetrics } from "convex/server";

const make = (
  meta: Pick<QueryMeta, "getTransactionMetrics" | "getSnapshotTs">,
) => ({
  getMetrics: Effect.fn("TransactionMetadata.getMetrics")(() =>
    Effect.promise(() => meta.getTransactionMetrics()),
  ),
  getSnapshotTs: Effect.fn("TransactionMetadata.getSnapshotTs")(() =>
    Effect.sync(() => meta.getSnapshotTs()),
  ),
});

export class TransactionMetadata extends Context.Service<
  TransactionMetadata,
  ReturnType<typeof make>
>()("@confect/server/TransactionMetadata") {}

export const layer = (
  meta: Pick<QueryMeta, "getTransactionMetrics" | "getSnapshotTs">,
) => Layer.succeed(TransactionMetadata, make(meta));
