import type { QueryMeta } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

/**
 * Native Convex transaction metrics that report the used and remaining amounts
 * for each resource, such as documents read or bytes written.
 *
 * @category Models
 */
export type { TransactionMetric, TransactionMetrics } from "convex/server";

const make = (
  meta: Pick<QueryMeta, "getTransactionMetrics" | "getSnapshotTs">,
) => ({
  /**
   * Reads how much of each transaction limit has been used and how much
   * remains. Each execution reads fresh metrics, so successive reads may
   * differ.
   *
   * @category Getters
   *
   * @returns An Effect producing native `TransactionMetrics`. A Convex
   *   rejection is a defect.
   */
  getMetrics: Effect.fn("TransactionMetadata.getMetrics")(() =>
    Effect.promise(() => meta.getTransactionMetrics()),
  ),
  /**
   * Reads the database snapshot timestamp of the current transaction in
   * nanoseconds.
   *
   * **Gotchas**
   *
   * Reading the timestamp in a query limits result caching. It is a database
   * timestamp, not a wall-clock time to compare with `Date.now()`.
   *
   * @category Getters
   *
   * @returns An Effect producing the timestamp as a `bigint`. A native
   *   exception is a defect.
   */
  getSnapshotTs: Effect.fn("TransactionMetadata.getSnapshotTs")(() =>
    Effect.sync(() => meta.getSnapshotTs()),
  ),
});

/**
 * Tag for the service that reports resource usage and snapshot time for the
 * current transaction. Yield the generated `TransactionMetadata` tag in a query
 * or mutation.
 *
 * @category Tags
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
