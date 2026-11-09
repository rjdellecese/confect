import * as Layer from "effect/Layer";
import { TransactionMetadata as BarrelTransactionMetadata } from "@confect/server";
import * as TransactionMetadata from "@confect/server/TransactionMetadata";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type { QueryMeta, TransactionMetrics } from "convex/server";
import * as Effect from "effect/Effect";
import { vi } from "vitest";

describe("TransactionMetadata", () => {
  it("exports the same service through the barrel and leaf module", () => {
    expect(BarrelTransactionMetadata.TransactionMetadata).toBe(
      TransactionMetadata.TransactionMetadata,
    );
    expectTypeOf<TransactionMetadata.TransactionMetrics>().toEqualTypeOf<TransactionMetrics>();
  });

  it.effect(
    "observes fresh transaction metrics on every execution without eager reads",
    () => {
      const before: TransactionMetrics = {
        bytesRead: { used: 0, remaining: 1000 },
        bytesWritten: { used: 0, remaining: 1000 },
        databaseQueries: { used: 0, remaining: 100 },
        documentsRead: { used: 0, remaining: 100 },
        documentsWritten: { used: 0, remaining: 100 },
        filesWritten: { used: 0, remaining: 100 },
        fileWriteBytes: { used: 0, remaining: 1000 },
        filesRead: { used: 0, remaining: 100 },
        fileReadBytes: { used: 0, remaining: 1000 },
        functionsScheduled: { used: 0, remaining: 100 },
        scheduledFunctionArgsBytes: { used: 0, remaining: 1000 },
      };
      const after: TransactionMetrics = {
        ...before,
        bytesRead: { used: 150, remaining: 850 },
        databaseQueries: { used: 1, remaining: 99 },
        documentsRead: { used: 2, remaining: 98 },
        filesWritten: { used: 1, remaining: 99 },
        fileWriteBytes: { used: 200, remaining: 800 },
        filesRead: { used: 1, remaining: 99 },
        fileReadBytes: { used: 150, remaining: 850 },
      };
      let current = before;
      const getTransactionMetrics = vi.fn(() => Promise.resolve(current));
      const meta = {
        getTransactionMetrics,
        getSnapshotTs: () => 1n,
      } satisfies Pick<QueryMeta, "getTransactionMetrics" | "getSnapshotTs">;
      const layer = TransactionMetadata.layer(meta);

      expect(getTransactionMetrics).not.toHaveBeenCalled();

      return Effect.gen(function* () {
        const services = yield* Layer.build(layer);
        return yield* Effect.gen(function* () {
          const transaction = yield* TransactionMetadata.TransactionMetadata;
          const getMetrics = transaction.getMetrics();

          expectTypeOf(getMetrics).toEqualTypeOf<
            Effect.Effect<TransactionMetrics>
          >();
          expect(getTransactionMetrics).not.toHaveBeenCalled();
          const getMetricsResult = yield* getMetrics;
          expect(getMetricsResult).toBe(before);
          current = after;
          const getMetricsResult2 = yield* getMetrics;
          expect(getMetricsResult2).toBe(after);
          expect(before.documentsRead).toEqual({ used: 0, remaining: 100 });
          expect(getTransactionMetrics).toHaveBeenCalledTimes(2);
          expect(getTransactionMetrics.mock.contexts[0]).toBe(meta);
          expect(getTransactionMetrics.mock.contexts[1]).toBe(meta);
        }).pipe(Effect.provideContext(services));
      }).pipe(Effect.scoped);
    },
  );

  it.effect("preserves rejected native promises as defects", () => {
    const failure = new Error("Transaction metrics unavailable");
    const meta = {
      getTransactionMetrics: () => Promise.reject(failure),
      getSnapshotTs: () => 1n,
    } satisfies Pick<QueryMeta, "getTransactionMetrics" | "getSnapshotTs">;

    return Effect.gen(function* () {
      const services = yield* Layer.build(TransactionMetadata.layer(meta));
      return yield* Effect.gen(function* () {
        const transaction = yield* TransactionMetadata.TransactionMetadata;
        const pipeResult = yield* transaction
          .getMetrics()
          .pipe(Effect.catchDefect(Effect.succeed));
        expect(pipeResult).toBe(failure);
      }).pipe(Effect.provideContext(services));
    }).pipe(Effect.scoped);
  });

  it.effect(
    "reads exact bigint snapshot timestamps lazily on every execution",
    () => {
      const first = 1_800_000_000_000_000_001n;
      const getSnapshotTs = vi.fn(() => first);
      const getTransactionMetrics = vi.fn<QueryMeta["getTransactionMetrics"]>();
      const meta = { getTransactionMetrics, getSnapshotTs };
      const layer = TransactionMetadata.layer(meta);
      expect(getSnapshotTs).not.toHaveBeenCalled();

      return Effect.gen(function* () {
        const services = yield* Layer.build(layer);
        return yield* Effect.gen(function* () {
          const transaction = yield* TransactionMetadata.TransactionMetadata;
          const snapshot = transaction.getSnapshotTs();
          expectTypeOf(snapshot).toEqualTypeOf<Effect.Effect<bigint>>();
          expect(getSnapshotTs).not.toHaveBeenCalled();
          const firstSnapshot = yield* snapshot;
          expect(firstSnapshot).toBe(first);
          getSnapshotTs.mockReturnValueOnce(first + 1n);
          const secondSnapshot = yield* snapshot;
          expect(secondSnapshot).toBe(first + 1n);
          expect(getSnapshotTs.mock.contexts).toEqual([meta, meta]);
          expect(getTransactionMetrics).not.toHaveBeenCalled();
        }).pipe(Effect.provideContext(services));
      }).pipe(Effect.scoped);
    },
  );

  it.effect("preserves synchronous snapshot failures as defects", () => {
    const failure = new Error("Snapshot unavailable");
    const getSnapshotTs = vi.fn((): bigint => {
      throw failure;
    });
    return Effect.gen(function* () {
      const services = yield* Layer.build(
        TransactionMetadata.layer({
          getSnapshotTs,
          getTransactionMetrics: vi.fn<QueryMeta["getTransactionMetrics"]>(),
        }),
      );
      return yield* Effect.gen(function* () {
        const transaction = yield* TransactionMetadata.TransactionMetadata;
        const snapshot = transaction.getSnapshotTs();
        expect(getSnapshotTs).not.toHaveBeenCalled();
        const defect = yield* snapshot.pipe(Effect.catchDefect(Effect.succeed));
        expect(defect).toBe(failure);
      }).pipe(Effect.provideContext(services));
    }).pipe(Effect.scoped);
  });
});
