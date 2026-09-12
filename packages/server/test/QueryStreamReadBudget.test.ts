import * as QueryStreamReadBudget from "@confect/server/QueryStreamReadBudget";
import { describe, expect, it } from "@effect/vitest";
import { getDocumentSize } from "convex/values";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

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
      expect(Option.isNone(yield* QueryStreamReadBudget.current)).toBe(true);
      expect(yield* QueryStreamReadBudget.isStopped(Option.none())).toBe(false);
      expect(
        yield* Stream.runCollect(
          QueryStreamReadBudget.charge(Stream.make(1, 2)),
        ),
      ).toEqual([1, 2]);
    }),
  );

  it.effect.each(["rows", "bytes"] as const)(
    "recognizes %s exhaustion at the exact limit",
    (kind) =>
      Effect.gen(function* () {
        const doc = { _id: "n1", _creationTime: 1, text: "hello" };
        const budget = yield* QueryStreamReadBudget.make({
          maximumRowsRead: kind === "rows" ? Option.some(2) : Option.none(),
          maximumBytesRead:
            kind === "bytes"
              ? Option.some(2 * getDocumentSize(doc))
              : Option.none(),
        });
        expect(
          yield* QueryStreamReadBudget.current.pipe(
            QueryStreamReadBudget.provide(budget),
          ),
        ).toEqual(Option.some(budget));
        expect(yield* QueryStreamReadBudget.isExhausted(budget)).toBe(false);
        for (const exhausted of [false, true]) {
          yield* QueryStreamReadBudget.charge(Stream.make(doc)).pipe(
            Stream.take(1),
            Stream.runDrain,
            QueryStreamReadBudget.provide(budget),
          );
          expect(yield* QueryStreamReadBudget.isExhausted(budget)).toBe(
            exhausted,
          );
          expect(
            yield* QueryStreamReadBudget.isStopped(Option.some(budget)),
          ).toBe(false);
        }
      }),
  );

  it.effect("keeps an unlimited budget free of row and byte accounting", () =>
    Effect.gen(function* () {
      const budget = yield* QueryStreamReadBudget.make({
        maximumRowsRead: Option.none(),
        maximumBytesRead: Option.none(),
      });
      expect(
        yield* QueryStreamReadBudget.current.pipe(
          QueryStreamReadBudget.provide(budget),
        ),
      ).toEqual(Option.none());
      expect(
        yield* QueryStreamReadBudget.charge(Stream.make(1, 2)).pipe(
          Stream.runCollect,
          QueryStreamReadBudget.provide(budget),
        ),
      ).toEqual([1, 2]);
      expect(yield* QueryStreamReadBudget.isExhausted(budget)).toBe(false);
      expect(yield* QueryStreamReadBudget.isStopped(Option.some(budget))).toBe(
        false,
      );
      const error = yield* QueryStreamReadBudget.exceeded(budget);
      expect(error.rowsRead).toBe(0);
      expect("bytesRead" in error).toBe(false);
      expect(Option.isNone(yield* QueryStreamReadBudget.current)).toBe(true);
    }),
  );

  it.effect.each(["rows", "bytes"] as const)(
    "stops zero %s budgets without pulling and finalizes the iterator",
    (kind) =>
      Effect.gen(function* () {
        let reads = 0;
        let finalized = 0;
        const budget = yield* QueryStreamReadBudget.make({
          maximumRowsRead: kind === "rows" ? Option.some(0) : Option.none(),
          maximumBytesRead: kind === "bytes" ? Option.some(0) : Option.none(),
        });
        const documents = Stream.fromAsyncIterable(
          {
            [Symbol.asyncIterator]: () => ({
              next: () => {
                reads++;
                return Promise.resolve({ done: false, value: 1 });
              },
              return: () => {
                finalized++;
                return Promise.resolve({ done: true, value: undefined });
              },
            }),
          },
          (error) => error,
        ).pipe(Stream.orDie);
        expect(yield* QueryStreamReadBudget.isExhausted(budget)).toBe(true);
        expect(
          yield* QueryStreamReadBudget.charge(documents).pipe(
            Stream.runCollect,
            QueryStreamReadBudget.provide(budget),
          ),
        ).toEqual([]);
        expect(reads).toBe(0);
        expect(finalized).toBe(1);
        expect(
          yield* QueryStreamReadBudget.isStopped(Option.some(budget)),
        ).toBe(true);
        const error = yield* QueryStreamReadBudget.exceeded(budget);
        expect(error.rowsRead).toBe(0);
        expect(error.bytesRead).toBe(kind === "bytes" ? 0 : undefined);
      }),
  );

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
        const budget = yield* QueryStreamReadBudget.make({
          maximumRowsRead: kind === "rows" ? Option.some(1) : Option.none(),
          maximumBytesRead: kind === "bytes" ? Option.some(1) : Option.none(),
        });
        const collected = yield* Stream.runCollect(
          QueryStreamReadBudget.charge(documents),
        ).pipe(QueryStreamReadBudget.provide(budget));
        expect(collected).toEqual([doc]);
        expect(reads).toBe(1);
        const error = yield* QueryStreamReadBudget.exceeded(budget);
        expect(error.rowsRead).toBe(1);
        expect(error.bytesRead).toBe(
          kind === "bytes" ? getDocumentSize(doc) : undefined,
        );
        expect(
          yield* QueryStreamReadBudget.isStopped(Option.some(budget)),
        ).toBe(true);
        for (let attempt = 0; attempt < 2; attempt++) {
          expect(
            yield* QueryStreamReadBudget.charge(documents).pipe(
              Stream.runCollect,
              QueryStreamReadBudget.provide(budget),
            ),
          ).toEqual([]);
          expect(reads).toBe(1);
          expect(
            yield* QueryStreamReadBudget.isStopped(Option.some(budget)),
          ).toBe(true);
          const repeatedError = yield* QueryStreamReadBudget.exceeded(budget);
          expect(repeatedError.rowsRead).toBe(error.rowsRead);
          expect(repeatedError.bytesRead).toBe(error.bytesRead);
          expect(repeatedError._tag).toBe(error._tag);
          expect(repeatedError.message).toBe(error.message);
        }
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
    expect(error.message).not.toContain("QueryStream.paginate");
  });

  it.effect("serializes charging across concurrent leaf streams", () =>
    Effect.gen(function* () {
      const budget = yield* QueryStreamReadBudget.make({
        maximumRowsRead: Option.some(1),
        maximumBytesRead: Option.none(),
      });
      const collected = yield* Effect.forEach(
        [1, 2],
        (value) =>
          QueryStreamReadBudget.charge(
            Stream.make(value).pipe(Stream.tap(() => Effect.yieldNow)),
          ).pipe(Stream.runCollect),
        { concurrency: "unbounded" },
      ).pipe(QueryStreamReadBudget.provide(budget));
      expect(collected.flat()).toHaveLength(1);
      expect(yield* QueryStreamReadBudget.isStopped(Option.some(budget))).toBe(
        true,
      );
      expect((yield* QueryStreamReadBudget.exceeded(budget)).rowsRead).toBe(1);
    }),
  );
});
