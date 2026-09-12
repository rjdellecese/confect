import * as QueryStreamReadBudget from "@confect/server/QueryStreamReadBudget";
import { describe, expect, it } from "@effect/vitest";
import { getDocumentSize } from "convex/values";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SynchronizedRef from "effect/SynchronizedRef";

describe("QueryStreamReadBudget", () => {
  it.each(["rowsRead", "bytesRead"] as const)(
    "rejects invalid %s counts",
    (field) => {
      for (const value of [
        -1,
        0.5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ]) {
        expect(
          Option.isNone(
            QueryStreamReadBudget.ReadBudgetExceededError.makeOption({
              rowsRead: 0,
              [field]: value,
            }),
          ),
        ).toBe(true);
      }
    },
  );

  it("accepts zero counts and optional byte accounting", () => {
    expect(
      new QueryStreamReadBudget.ReadBudgetExceededError({ rowsRead: 0 }),
    ).toMatchObject({ rowsRead: 0 });
    expect(
      new QueryStreamReadBudget.ReadBudgetExceededError({
        rowsRead: 0,
        bytesRead: 0,
      }),
    ).toMatchObject({ rowsRead: 0, bytesRead: 0 });
  });

  it.effect("defaults to unrestricted reads without a shared budget", () =>
    Effect.gen(function* () {
      const limits = yield* QueryStreamReadBudget.Limits;
      expect(Option.isNone(limits.maximumRowsRead)).toBe(true);
      expect(Option.isNone(limits.maximumBytesRead)).toBe(true);
      expect(Option.isNone(yield* QueryStreamReadBudget.Status)).toBe(true);
      expect(yield* QueryStreamReadBudget.isStopped(Option.none())).toBe(false);
      expect(
        yield* Stream.runCollect(
          QueryStreamReadBudget.charge(Stream.make(1, 2)),
        ),
      ).toEqual([1, 2]);
    }),
  );

  it("recognizes both row and byte exhaustion", () => {
    const state = new QueryStreamReadBudget.QueryStreamReadBudget({
      rows: 2,
      bytes: 20,
      status: QueryStreamReadBudget.Phase.Active(),
    });
    expect(
      QueryStreamReadBudget.isExhausted(
        { maximumRowsRead: Option.some(2), maximumBytesRead: Option.none() },
        state,
      ),
    ).toBe(true);
    expect(
      QueryStreamReadBudget.isExhausted(
        { maximumRowsRead: Option.none(), maximumBytesRead: Option.some(20) },
        state,
      ),
    ).toBe(true);
    expect(
      QueryStreamReadBudget.isExhausted(
        { maximumRowsRead: Option.some(3), maximumBytesRead: Option.some(21) },
        state,
      ),
    ).toBe(false);
    expect(
      QueryStreamReadBudget.isExhausted(
        { maximumRowsRead: Option.none(), maximumBytesRead: Option.none() },
        state,
      ),
    ).toBe(false);
  });

  it.effect.each(["rows", "bytes"] as const)(
    "stops before the next leaf read when %s are exhausted",
    (kind) =>
      Effect.gen(function* () {
        const doc = { _id: "n1", _creationTime: 1, text: "hello" };
        let reads = 0;
        const documents = Stream.fromIterable([
          doc,
          { ...doc, _id: "n2" },
        ]).pipe(
          Stream.rechunk(1),
          Stream.tap(() =>
            Effect.sync(() => {
              reads++;
            }),
          ),
        );
        const ref = yield* SynchronizedRef.make(
          new QueryStreamReadBudget.QueryStreamReadBudget({
            rows: 0,
            bytes: 0,
            status: QueryStreamReadBudget.Phase.Active(),
          }),
        );
        const collected = yield* Stream.runCollect(
          QueryStreamReadBudget.charge(documents),
        ).pipe(
          Effect.provideService(QueryStreamReadBudget.Status, Option.some(ref)),
          Effect.provideService(QueryStreamReadBudget.Limits, {
            maximumRowsRead: kind === "rows" ? Option.some(1) : Option.none(),
            maximumBytesRead: kind === "bytes" ? Option.some(1) : Option.none(),
          }),
        );
        expect(collected).toEqual([doc]);
        expect(reads).toBe(1);
        const state = yield* SynchronizedRef.get(ref);
        expect(state.rows).toBe(1);
        expect(state.bytes).toBe(kind === "bytes" ? getDocumentSize(doc) : 0);
        expect(yield* QueryStreamReadBudget.isStopped(Option.some(ref))).toBe(
          true,
        );
      }),
  );

  it("preserves the pagination error tag and details", () => {
    const error = new QueryStreamReadBudget.ReadBudgetExceededError({
      rowsRead: 2,
      bytesRead: 20,
    });
    expect(error._tag).toBe("ReadBudgetExceededError");
    expect(error.rowsRead).toBe(2);
    expect(error.bytesRead).toBe(20);
    expect(error.message).toContain("before a safe page boundary");
  });
});
