import { Transaction as BarrelTransaction } from "@confect/server";
import * as Transaction from "@confect/server/Transaction";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type { QueryMeta, TransactionMetrics } from "convex/server";
import * as Effect from "effect/Effect";
import { vi } from "vitest";

describe("Transaction", () => {
  it("exports the same service through the barrel and leaf module", () => {
    expect(BarrelTransaction.Transaction).toBe(Transaction.Transaction);
    expectTypeOf<Transaction.TransactionMetrics>().toEqualTypeOf<TransactionMetrics>();
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
        functionsScheduled: { used: 0, remaining: 100 },
        scheduledFunctionArgsBytes: { used: 0, remaining: 1000 },
      };
      const after: TransactionMetrics = {
        ...before,
        bytesRead: { used: 150, remaining: 850 },
        databaseQueries: { used: 1, remaining: 99 },
        documentsRead: { used: 2, remaining: 98 },
      };
      let current = before;
      const getTransactionMetrics = vi.fn(() => Promise.resolve(current));
      const meta = { getTransactionMetrics } satisfies Pick<
        QueryMeta,
        "getTransactionMetrics"
      >;
      const layer = Transaction.layer(meta);

      expect(getTransactionMetrics).not.toHaveBeenCalled();

      return Effect.gen(function* () {
        const transaction = yield* Transaction.Transaction;
        const getMetrics = transaction.getMetrics();

        expectTypeOf(getMetrics).toEqualTypeOf<
          Effect.Effect<TransactionMetrics>
        >();
        expect(getTransactionMetrics).not.toHaveBeenCalled();
        expect(yield* getMetrics).toBe(before);
        current = after;
        expect(yield* getMetrics).toBe(after);
        expect(before.documentsRead).toEqual({ used: 0, remaining: 100 });
        expect(getTransactionMetrics).toHaveBeenCalledTimes(2);
        expect(getTransactionMetrics.mock.contexts[0]).toBe(meta);
        expect(getTransactionMetrics.mock.contexts[1]).toBe(meta);
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect("preserves rejected native promises as defects", () => {
    const failure = new Error("Transaction metrics unavailable");
    const meta = {
      getTransactionMetrics: () => Promise.reject(failure),
    } satisfies Pick<QueryMeta, "getTransactionMetrics">;

    return Effect.gen(function* () {
      const transaction = yield* Transaction.Transaction;
      expect(
        yield* transaction
          .getMetrics()
          .pipe(Effect.catchDefect(Effect.succeed)),
      ).toBe(failure);
    }).pipe(Effect.provide(Transaction.layer(meta)));
  });
});
