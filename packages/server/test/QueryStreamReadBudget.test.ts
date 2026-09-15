import * as QueryStreamReadBudget from "@confect/server/QueryStreamReadBudget";
import { describe, expect, it } from "@effect/vitest";
import { getDocumentSize } from "convex/values";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

describe("QueryStreamReadBudget", () => {
  it.effect.each(["maximumRowsRead", "maximumBytesRead"] as const)(
    "parses %s before allocating a budget",
    (field) =>
      Effect.gen(function* () {
        for (const value of [-1, 0.5, NaN, Infinity, -Infinity]) {
          const error = yield* QueryStreamReadBudget.make({
            maximumRowsRead: Option.none(),
            maximumBytesRead: Option.none(),
            [field]: Option.some(value),
          }).pipe(Effect.flip);
          expect(error).toBeInstanceOf(
            QueryStreamReadBudget.InvalidReadLimitError,
          );
          expect(error.field).toBe(field);
          expect(error.value).toBe(value);
        }
      }),
  );

  it.effect.each(["rows", "bytes"] as const)(
    "stops at either %s limit when both limits are present",
    (firstLimit) =>
      Effect.gen(function* () {
        const doc = { _id: "n1", _creationTime: 1, text: "hello" };
        const budget = yield* QueryStreamReadBudget.make({
          maximumRowsRead: Option.some(firstLimit === "rows" ? 1 : 10),
          maximumBytesRead: Option.some(firstLimit === "bytes" ? 1 : 10000),
        });
        const result = yield* budget
          .accountFor(Stream.fromIterable([doc, doc]).pipe(Stream.rechunk(1)))
          .pipe(Stream.runCollect);
        expect(result).toEqual([doc]);
        expect(yield* budget.getReadCounts).toMatchObject({
          rowsRead: 1,
          bytesRead: getDocumentSize(doc),
        });
        expect(yield* budget.isStopped).toBe(true);
      }),
  );

  it.effect(
    "counts concurrent unlimited streams without serializing their reads",
    () =>
      Effect.gen(function* () {
        const budget = yield* QueryStreamReadBudget.make({
          maximumRowsRead: Option.none(),
          maximumBytesRead: Option.none(),
        });
        const initialCounts = yield* budget.getReadCounts;
        const firstEntered = yield* Deferred.make<void>();
        const secondEntered = yield* Deferred.make<void>();
        const first = { value: "first" };
        const second = { value: "second" };

        const collected = yield* Effect.all(
          [
            Stream.fromEffect(
              Effect.gen(function* () {
                yield* Deferred.succeed(firstEntered, undefined);
                yield* Deferred.await(secondEntered);
                return first;
              }),
            ).pipe(budget.accountFor, Stream.runCollect),
            Stream.fromEffect(
              Effect.gen(function* () {
                yield* Deferred.succeed(secondEntered, undefined);
                yield* Deferred.await(firstEntered);
                return second;
              }),
            ).pipe(budget.accountFor, Stream.runCollect),
          ],
          { concurrency: "unbounded" },
        );

        expect(collected).toEqual([[first], [second]]);
        expect(yield* budget.getReadCounts).toEqual({
          rowsRead: 2,
          bytesRead: getDocumentSize(first) + getDocumentSize(second),
        });
        expect(initialCounts).toEqual({ rowsRead: 0, bytesRead: 0 });
        expect(yield* budget.isExhausted).toBe(false);
        expect(yield* budget.isStopped).toBe(false);
      }),
  );

  it.effect(
    "supports unrestricted reads with an explicit unlimited budget",
    () =>
      Effect.gen(function* () {
        const budget = yield* QueryStreamReadBudget.make({
          maximumRowsRead: Option.none(),
          maximumBytesRead: Option.none(),
        });
        expect(yield* budget.isStopped).toBe(false);
        expect(
          yield* Stream.runCollect(
            budget.accountFor(Stream.make({ value: 1 }, { value: 2 })),
          ),
        ).toEqual([{ value: 1 }, { value: 2 }]);
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
        expect(yield* budget.isExhausted).toBe(false);
        for (const exhausted of [false, true]) {
          yield* budget
            .accountFor(Stream.make(doc))
            .pipe(Stream.take(1), Stream.runDrain);
          expect(yield* budget.isExhausted).toBe(exhausted);
          expect(yield* budget.isStopped).toBe(false);
        }
      }),
  );

  it.effect("tracks rows and bytes without enforcing a limit", () =>
    Effect.gen(function* () {
      const budget = yield* QueryStreamReadBudget.make({
        maximumRowsRead: Option.none(),
        maximumBytesRead: Option.none(),
      });
      expect(yield* budget.isUnlimited).toBe(true);
      expect(
        yield* budget
          .accountFor(Stream.make({ value: 1 }, { value: 2 }))
          .pipe(Stream.runCollect),
      ).toEqual([{ value: 1 }, { value: 2 }]);
      expect(yield* budget.isExhausted).toBe(false);
      expect(yield* budget.isStopped).toBe(false);
      const counts = yield* budget.getReadCounts;
      expect(counts).toEqual({
        rowsRead: 2,
        bytesRead:
          getDocumentSize({ value: 1 }) + getDocumentSize({ value: 2 }),
      });
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
                return Promise.resolve({ done: false, value: { value: 1 } });
              },
              return: () => {
                finalized++;
                return Promise.resolve({ done: true, value: undefined });
              },
            }),
          },
          (error) => error,
        ).pipe(Stream.orDie);
        expect(yield* budget.isExhausted).toBe(true);
        expect(
          yield* budget.accountFor(documents).pipe(Stream.runCollect),
        ).toEqual([]);
        expect(reads).toBe(0);
        expect(finalized).toBe(1);
        expect(yield* budget.isStopped).toBe(true);
        const counts = yield* budget.getReadCounts;
        expect(counts.rowsRead).toBe(0);
        expect(counts.bytesRead).toBe(0);
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
          budget.accountFor(documents),
        );
        expect(collected).toEqual([doc]);
        expect(reads).toBe(1);
        const counts = yield* budget.getReadCounts;
        expect(counts.rowsRead).toBe(1);
        expect(counts.bytesRead).toBe(getDocumentSize(doc));
        expect(yield* budget.isStopped).toBe(true);
        for (let attempt = 0; attempt < 2; attempt++) {
          expect(
            yield* budget.accountFor(documents).pipe(Stream.runCollect),
          ).toEqual([]);
          expect(reads).toBe(1);
          expect(yield* budget.isStopped).toBe(true);
          const repeatedCounts = yield* budget.getReadCounts;
          expect(repeatedCounts).toEqual(counts);
        }
      }),
  );

  it.effect("serializes accounting across concurrent leaf streams", () =>
    Effect.gen(function* () {
      const budget = yield* QueryStreamReadBudget.make({
        maximumRowsRead: Option.some(1),
        maximumBytesRead: Option.none(),
      });
      const collected = yield* Effect.forEach(
        [1, 2],
        (value) =>
          budget
            .accountFor(
              Stream.make({ value }).pipe(Stream.tap(() => Effect.yieldNow)),
            )
            .pipe(Stream.runCollect),
        { concurrency: "unbounded" },
      );
      expect(collected.flat()).toHaveLength(1);
      expect(yield* budget.isStopped).toBe(true);
      expect((yield* budget.getReadCounts).rowsRead).toBe(1);
    }),
  );
});
