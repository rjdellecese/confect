import type { QueryMeta } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

/**
 * Native Convex resource metrics, with used and remaining quantities.
 *
 * @category Models
 */
export type { TransactionMetric, TransactionMetrics } from "convex/server";

const make = (
  meta: Pick<QueryMeta, "getTransactionMetrics" | "getSnapshotTs">,
) => ({
  /**
   * Read current transaction usage and remaining limits without caching them.
   *
   * @category Getters
   *
   * @returns An Effect producing native TransactionMetrics; native rejection is
   *   a defect.
   */
  getMetrics: Effect.fn("TransactionMetadata.getMetrics")(() =>
    Effect.promise(() => meta.getTransactionMetrics()),
  ),
  /**
   * Read the transaction's snapshot timestamp.
   *
   * @category Getters
   *
   * @returns An Effect producing bigint nanoseconds. Reading it affects query
   *   caching; a native throw is a defect.
   */
  getSnapshotTs: Effect.fn("TransactionMetadata.getSnapshotTs")(() =>
    Effect.sync(() => meta.getSnapshotTs()),
  ),
});

/**
 * Transaction metrics/snapshot service for queries and mutations. Acquire the
 * generated `TransactionMetadata` tag; successive metric reads may differ.
 *
 * @category Services
 */
export class TransactionMetadata extends Context.Service<
  TransactionMetadata,
  ReturnType<typeof make>
>()("@confect/server/TransactionMetadata") {}

/**
 * @internal
 */
export const layer = (
  meta: Pick<QueryMeta, "getTransactionMetrics" | "getSnapshotTs">,
) => Layer.succeed(TransactionMetadata, make(meta));
