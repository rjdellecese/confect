import * as QueryStreamReadBudget from "@confect/server/QueryStreamReadBudget";
import { describe, expect, it } from "@effect/vitest";
import { getDocumentSize } from "convex/values";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Match from "effect/Match";
import * as Stream from "effect/Stream";
import * as Schema from "effect/Schema";

describe("QueryStreamReadBudget", () => {
  it.effect.each(["maximumRowsRead", "maximumBytesRead"] as const)(
    "rejects invalid %s when decoding limits",
    (field) =>
      Effect.gen(function* () {
        for (const value of [-1, 0.5, NaN, Infinity, -Infinity]) {
          const error = yield* Schema.decodeEffect(
            QueryStreamReadBudget.Limits,
          )({
            [field]: value,
          }).pipe(Effect.flip);
          expect(Schema.isSchemaError(error)).toBe(true);
          expect(error.message).toContain(field);
        }
      }),
  );

  it.effect("decodes absent limits and zero", () =>
    Effect.gen(function* () {
      const decode = Schema.decodeEffect(QueryStreamReadBudget.Limits);
      const unlimited = {
        maximumRowsRead: Option.none(),
        maximumBytesRead: Option.none(),
      };
      const decodeResult = yield* decode({});
      expect(decodeResult).toEqual(unlimited);
      const decodeResult2 = yield* decode({
        maximumRowsRead: 0,
        maximumBytesRead: 0,
      });
      expect(decodeResult2).toEqual({
        maximumRowsRead: Option.some(0),
        maximumBytesRead: Option.some(0),
      });
    }),
  );

  it.effect.each(["maximumRowsRead", "maximumBytesRead"] as const)(
    "rejects explicitly undefined %s",
    (field) =>
      Effect.gen(function* () {
        const input = Match.value(field).pipe(
          Match.when("maximumRowsRead", () => ({ maximumRowsRead: undefined })),
          Match.when("maximumBytesRead", () => ({
            maximumBytesRead: undefined,
          })),
          Match.exhaustive,
        );
        const error = yield* Schema.decodeUnknownEffect(
          QueryStreamReadBudget.Limits,
        )(input).pipe(Effect.flip);
        expect(Schema.isSchemaError(error)).toBe(true);
        expect(error.message).toContain(field);
      }),
  );

  it.effect.each(["rows", "bytes"] as const)(
    "stops at either %s limit when both limits are present",
    (firstLimit) =>
      Effect.gen(function* () {
        const doc = { _id: "n1", _creationTime: 1, text: "hello" };
        const value2 = yield* Schema.decodeEffect(QueryStreamReadBudget.Limits)(
          Match.value(firstLimit).pipe(
            Match.when("rows", () => ({
              maximumRowsRead: 1,
              maximumBytesRead: 10000,
            })),
            Match.when("bytes", () => ({
              maximumRowsRead: 10,
              maximumBytesRead: 1,
            })),
            Match.exhaustive,
          ),
        );
        const budget = yield* QueryStreamReadBudget.make(value2);
        const result = yield* budget
          .accountFor(Stream.fromIterable([doc, doc]).pipe(Stream.rechunk(1)))
          .pipe(Stream.runCollect);
        expect(result).toEqual([doc]);
        const getReadCountsResult = yield* budget.getReadCounts;
        expect(getReadCountsResult).toMatchObject({
          rowsRead: 1,
          bytesRead: getDocumentSize(doc),
        });
        const isStoppedResult = yield* budget.isStopped;
        expect(isStoppedResult).toBe(true);
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
        const getReadCountsResult2 = yield* budget.getReadCounts;
        expect(getReadCountsResult2).toEqual({
          rowsRead: 2,
          bytesRead: getDocumentSize(first) + getDocumentSize(second),
        });
        expect(initialCounts).toEqual({ rowsRead: 0, bytesRead: 0 });
        const isExhaustedResult = yield* budget.isExhausted;
        expect(isExhaustedResult).toBe(false);
        const isStoppedResult2 = yield* budget.isStopped;
        expect(isStoppedResult2).toBe(false);
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
        const isStoppedResult3 = yield* budget.isStopped;
        expect(isStoppedResult3).toBe(false);
        const runCollectResult = yield* Stream.runCollect(
          budget.accountFor(Stream.make({ value: 1 }, { value: 2 })),
        );
        expect(runCollectResult).toEqual([{ value: 1 }, { value: 2 }]);
      }),
  );

  it.effect.each(["rows", "bytes"] as const)(
    "recognizes %s exhaustion at the exact limit",
    (kind) =>
      Effect.gen(function* () {
        const doc = { _id: "n1", _creationTime: 1, text: "hello" };
        const value3 = yield* Schema.decodeEffect(QueryStreamReadBudget.Limits)(
          Match.value(kind).pipe(
            Match.when("rows", () => ({ maximumRowsRead: 2 })),
            Match.when("bytes", () => ({
              maximumBytesRead: 2 * getDocumentSize(doc),
            })),
            Match.exhaustive,
          ),
        );
        const budget = yield* QueryStreamReadBudget.make(value3);
        const isExhaustedResult2 = yield* budget.isExhausted;
        expect(isExhaustedResult2).toBe(false);
        for (const exhausted of [false, true]) {
          yield* budget
            .accountFor(Stream.make(doc))
            .pipe(Stream.take(1), Stream.runDrain);
          const isExhaustedResult3 = yield* budget.isExhausted;
          expect(isExhaustedResult3).toBe(exhausted);
          const isStoppedResult4 = yield* budget.isStopped;
          expect(isStoppedResult4).toBe(false);
        }
      }),
  );

  it.effect("tracks rows and bytes without enforcing a limit", () =>
    Effect.gen(function* () {
      const budget = yield* QueryStreamReadBudget.make({
        maximumRowsRead: Option.none(),
        maximumBytesRead: Option.none(),
      });
      const isUnlimitedResult = yield* budget.isUnlimited;
      expect(isUnlimitedResult).toBe(true);
      const pipeResult = yield* budget
        .accountFor(Stream.make({ value: 1 }, { value: 2 }))
        .pipe(Stream.runCollect);
      expect(pipeResult).toEqual([{ value: 1 }, { value: 2 }]);
      const isExhaustedResult4 = yield* budget.isExhausted;
      expect(isExhaustedResult4).toBe(false);
      const isStoppedResult5 = yield* budget.isStopped;
      expect(isStoppedResult5).toBe(false);
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
        const value4 = yield* Schema.decodeEffect(QueryStreamReadBudget.Limits)(
          Match.value(kind).pipe(
            Match.when("rows", () => ({ maximumRowsRead: 0 })),
            Match.when("bytes", () => ({ maximumBytesRead: 0 })),
            Match.exhaustive,
          ),
        );
        const budget = yield* QueryStreamReadBudget.make(value4);
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
        const isExhaustedResult5 = yield* budget.isExhausted;
        expect(isExhaustedResult5).toBe(true);
        const pipeResult2 = yield* budget
          .accountFor(documents)
          .pipe(Stream.runCollect);
        expect(pipeResult2).toEqual([]);
        expect(reads).toBe(0);
        expect(finalized).toBe(1);
        const isStoppedResult6 = yield* budget.isStopped;
        expect(isStoppedResult6).toBe(true);
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
        const value5 = yield* Schema.decodeEffect(QueryStreamReadBudget.Limits)(
          Match.value(kind).pipe(
            Match.when("rows", () => ({ maximumRowsRead: 1 })),
            Match.when("bytes", () => ({ maximumBytesRead: 1 })),
            Match.exhaustive,
          ),
        );
        const budget = yield* QueryStreamReadBudget.make(value5);
        const collected = yield* Stream.runCollect(
          budget.accountFor(documents),
        );
        expect(collected).toEqual([doc]);
        expect(reads).toBe(1);
        const counts = yield* budget.getReadCounts;
        expect(counts.rowsRead).toBe(1);
        expect(counts.bytesRead).toBe(getDocumentSize(doc));
        const isStoppedResult7 = yield* budget.isStopped;
        expect(isStoppedResult7).toBe(true);
        for (let attempt = 0; attempt < 2; attempt++) {
          const pipeResult3 = yield* budget
            .accountFor(documents)
            .pipe(Stream.runCollect);
          expect(pipeResult3).toEqual([]);
          expect(reads).toBe(1);
          const isStoppedResult8 = yield* budget.isStopped;
          expect(isStoppedResult8).toBe(true);
          const repeatedCounts = yield* budget.getReadCounts;
          expect(repeatedCounts).toEqual(counts);
        }
      }),
  );

  it.effect("serializes accounting across concurrent leaf streams", () =>
    Effect.gen(function* () {
      const value6 = yield* Schema.decodeEffect(QueryStreamReadBudget.Limits)({
        maximumRowsRead: 1,
      });
      const budget = yield* QueryStreamReadBudget.make(value6);
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
      const isStoppedResult9 = yield* budget.isStopped;
      expect(isStoppedResult9).toBe(true);
      expect((yield* budget.getReadCounts).rowsRead).toBe(1);
    }),
  );
});
