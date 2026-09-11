import * as QueryStreamIndexRange from "@confect/server/QueryStreamIndexRange";
import type * as QueryStreamOrderDirection from "@confect/server/QueryStreamOrderDirection";
import * as QueryStreamReadBudget from "@confect/server/QueryStreamReadBudget";
import { describe, expect, it } from "@effect/vitest";
import * as QueryStream from "@confect/server/QueryStream";
import { compareValues } from "convex/values";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

const tableSchema = Schema.Struct({ group: Schema.String });
const distinctFields: ReadonlyArray<string> = ["group"];

const documents = [
  { _id: "a1", _creationTime: 1, group: "a" },
  { _id: "a2", _creationTime: 2, group: "a" },
  { _id: "b1", _creationTime: 3, group: "b" },
  { _id: "b2", _creationTime: 4, group: "b" },
];

type Document = (typeof documents)[number];

interface ReaderRun {
  readonly order: QueryStreamOrderDirection.QueryStreamOrderDirection;
  next: number;
  returned: number;
  settled: number;
}

interface PendingRead {
  readonly iterator: number;
  readonly entered: Deferred.Deferred<void>;
  readonly release: Deferred.Deferred<void>;
  readonly settled: Deferred.Deferred<void>;
}

const makeReader = (pending?: PendingRead) => {
  const runs: Array<ReaderRun> = [];
  const events: Array<string> = [];
  const reader: QueryStream.ReflectionReader = {
    query: () => ({
      withIndex: (_indexName, indexRange) => {
        const operations: Array<QueryStreamIndexRange.RangeOp> = [];
        const record =
          (_tag: QueryStreamIndexRange.RangeOp["_tag"]) =>
          (field: string, value: QueryStreamIndexRange.RangeOp["value"]) => {
            operations.push({ _tag, field, value });
            return builder;
          };
        const builder = {
          eq: record("eq"),
          gt: record("gt"),
          gte: record("gte"),
          lt: record("lt"),
          lte: record("lte"),
        };
        indexRange?.(builder);
        return {
          order: (order) => ({
            [Symbol.asyncIterator]: () => {
              const id = runs.length;
              const run: ReaderRun = {
                order,
                next: 0,
                returned: 0,
                settled: 0,
              };
              runs.push(run);
              events.push(`${id}:open:${order}`);
              const matching = documents.filter((document) =>
                operations.every(({ _tag, field, value }) => {
                  if (
                    field !== "group" &&
                    field !== "_creationTime" &&
                    field !== "_id"
                  ) {
                    throw new Error(`Unexpected index field: ${field}`);
                  }
                  const comparison = compareValues(document[field], value);
                  switch (_tag) {
                    case "eq":
                      return comparison === 0;
                    case "gt":
                      return comparison > 0;
                    case "gte":
                      return comparison >= 0;
                    case "lt":
                      return comparison < 0;
                    case "lte":
                      return comparison <= 0;
                  }
                }),
              );
              if (order === "desc") matching.reverse();
              let position = 0;
              const result = (): IteratorResult<Document> => {
                run.settled++;
                const value = matching[position++];
                return value === undefined
                  ? { done: true, value: undefined }
                  : { done: false, value };
              };
              return {
                next: () => {
                  run.next++;
                  events.push(`${id}:next`);
                  if (pending?.iterator === id) {
                    Deferred.doneUnsafe(pending.entered, Effect.void);
                    return Effect.runPromise(
                      Deferred.await(pending.release),
                    ).then(() => {
                      const value = result();
                      Deferred.doneUnsafe(pending.settled, Effect.void);
                      return value;
                    });
                  }
                  return Promise.resolve(result());
                },
                return: () => {
                  run.returned++;
                  events.push(`${id}:return`);
                  return Promise.resolve({
                    done: true as const,
                    value: undefined,
                  });
                },
              };
            },
          }),
        };
      },
    }),
  };
  const stream = QueryStream.fromReflection<Document, "asc">({
    reader,
    tableName: "documents",
    tableSchema,
    indexName: "by_group",
    indexFields: ["group", "_creationTime"],
    spec: QueryStreamIndexRange.rangeBuilder<
      Document,
      ["group", "_creationTime"]
    >(),
    order: "asc",
  });
  return { stream, runs, events };
};

describe("QueryStream iterator lifecycle", () => {
  it.effect("isolates budget limits and status across page executions", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const settled = yield* Deferred.make<void>();
      const reader = makeReader({ iterator: 0, entered, release, settled });
      const budgeted = QueryStream.paginate(reader.stream, {
        cursor: null,
        numItems: 10,
        maximumRowsRead: 1,
      });
      const pending = yield* budgeted.pipe(Effect.forkScoped);
      yield* Deferred.await(entered);

      const unlimited = yield* QueryStream.paginate(reader.stream, {
        cursor: null,
        numItems: 3,
      });
      expect(unlimited.page).toEqual(documents.slice(0, 3));
      expect(unlimited.pageStatus).toBeUndefined();

      yield* Deferred.succeed(release, undefined);
      const first = yield* Fiber.join(pending);
      expect(first.page).toEqual([documents[0]]);
      expect(first.pageStatus).toBe("SplitRequired");

      const repeated = yield* budgeted;
      expect(repeated).toEqual(first);
      expect(reader.runs).toEqual([
        { order: "asc", next: 1, returned: 1, settled: 1 },
        { order: "asc", next: 3, returned: 1, settled: 3 },
        { order: "asc", next: 1, returned: 1, settled: 1 },
      ]);
    }).pipe(Effect.scoped),
  );

  it.effect("closes a budget-protected leaf when the page succeeds early", () =>
    Effect.gen(function* () {
      const reader = makeReader();
      const page = yield* QueryStream.paginate(reader.stream, {
        cursor: null,
        numItems: 1,
        maximumRowsRead: 10,
      });

      expect(page.page).toEqual([documents[0]]);
      expect(reader.runs).toEqual([
        { order: "asc", next: 1, returned: 1, settled: 1 },
      ]);
      expect(reader.events).toEqual(["0:open:asc", "0:next", "0:return"]);
    }),
  );

  it.effect(
    "closes reverse distinct discovery before opening its representative probe",
    () =>
      Effect.gen(function* () {
        const reader = makeReader();
        const head = yield* reader.stream.pipe(
          QueryStream.distinct(distinctFields),
          QueryStream.reverse,
          Stream.runHead,
        );

        expect(head).toEqual(Option.some(documents[2]));
        expect(reader.runs).toEqual([
          { order: "desc", next: 1, returned: 1, settled: 1 },
          { order: "asc", next: 1, returned: 1, settled: 1 },
        ]);
        expect(reader.events).toEqual([
          "0:open:desc",
          "0:next",
          "0:return",
          "1:open:asc",
          "1:next",
          "1:return",
        ]);
      }),
  );

  it.effect(
    "closes both short-lived readers when reverse distinct pagination succeeds early",
    () =>
      Effect.gen(function* () {
        const reader = makeReader();
        const page = yield* reader.stream.pipe(
          QueryStream.distinct(distinctFields),
          QueryStream.reverse,
          QueryStream.paginate({
            cursor: null,
            numItems: 1,
            maximumRowsRead: 10,
          }),
        );

        expect(page.page).toEqual([documents[2]]);
        expect(reader.events).toEqual([
          "0:open:desc",
          "0:next",
          "0:return",
          "1:open:asc",
          "1:next",
          "1:return",
        ]);
      }),
  );

  it.effect(
    "stops a representative probe at its first unfiltered document",
    () =>
      Effect.gen(function* () {
        const reader = makeReader();
        const head = yield* reader.stream.pipe(
          QueryStream.filter((document) => document._id !== "b1"),
          QueryStream.distinct(distinctFields),
          QueryStream.reverse,
          Stream.runHead,
        );

        expect(head).toEqual(Option.some(documents[3]));
        expect(reader.runs).toEqual([
          { order: "desc", next: 1, returned: 1, settled: 1 },
          { order: "asc", next: 2, returned: 1, settled: 2 },
        ]);
        expect(reader.events).toEqual([
          "0:open:desc",
          "0:next",
          "0:return",
          "1:open:asc",
          "1:next",
          "1:next",
          "1:return",
        ]);
      }),
  );

  it.effect(
    "retains the first probe key when its entire group is filtered out",
    () =>
      Effect.gen(function* () {
        const reader = makeReader();
        const reversed = reader.stream.pipe(
          QueryStream.filter((document) => document.group !== "b"),
          QueryStream.distinct(distinctFields),
          QueryStream.reverse,
        );
        const head = yield* Stream.runHead(reversed.annotated);

        expect(head).toEqual(
          Option.some(
            new QueryStream.Element({
              doc: Option.none(),
              key: ["b", 3, "b1"],
            }),
          ),
        );
        expect(reader.runs).toEqual([
          { order: "desc", next: 1, returned: 1, settled: 1 },
          { order: "asc", next: 3, returned: 1, settled: 3 },
        ]);
        expect(reader.events).toEqual([
          "0:open:desc",
          "0:next",
          "0:return",
          "1:open:asc",
          "1:next",
          "1:next",
          "1:next",
          "1:return",
        ]);
      }),
  );

  it.effect(
    "closes the leaf when its read budget produces a partial page",
    () =>
      Effect.gen(function* () {
        const reader = makeReader();
        const page = yield* QueryStream.paginate(reader.stream, {
          cursor: null,
          numItems: 10,
          maximumRowsRead: 2,
        });

        expect(page.page).toEqual(documents.slice(0, 2));
        expect(page.isDone).toBe(false);
        expect(reader.runs).toEqual([
          { order: "asc", next: 2, returned: 1, settled: 2 },
        ]);
      }),
  );

  it.effect(
    "closes reverse discovery when the budget cannot fund a representative",
    () =>
      Effect.gen(function* () {
        const reader = makeReader();
        const error = yield* reader.stream.pipe(
          QueryStream.distinct(distinctFields),
          QueryStream.reverse,
          QueryStream.paginate({
            cursor: null,
            numItems: 10,
            maximumRowsRead: 1,
          }),
          Effect.flip,
        );

        expect(error).toBeInstanceOf(QueryStreamReadBudget.ExceededError);
        expect(error).toMatchObject({ rowsRead: 1 });
        expect(reader.events).toEqual(["0:open:desc", "0:next", "0:return"]);
      }),
  );

  it.effect(
    "closes a representative probe when filtering exhausts its budget",
    () =>
      Effect.gen(function* () {
        const reader = makeReader();
        const error = yield* reader.stream.pipe(
          QueryStream.filter((document) => document._id !== "b1"),
          QueryStream.distinct(distinctFields),
          QueryStream.reverse,
          QueryStream.paginate({
            cursor: null,
            numItems: 10,
            maximumRowsRead: 2,
          }),
          Effect.flip,
        );

        expect(error).toBeInstanceOf(QueryStreamReadBudget.ExceededError);
        expect(error).toMatchObject({ rowsRead: 2 });
        expect(reader.events).toEqual([
          "0:open:desc",
          "0:next",
          "0:return",
          "1:open:asc",
          "1:next",
          "1:return",
        ]);
      }),
  );

  for (const stage of [
    "leaf",
    "reverse discovery",
    "representative probe",
  ] as const) {
    it.effect(
      `releases ${stage} while next is pending and ignores its later resolution`,
      () =>
        Effect.gen(function* () {
          const entered = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          const settled = yield* Deferred.make<void>();
          const iterator = stage === "representative probe" ? 1 : 0;
          const reader = makeReader({ iterator, entered, release, settled });
          const examined: Array<string> = [];
          let processed = 0;
          const observed = reader.stream.pipe(
            QueryStream.filterEffect((document) =>
              Effect.sync(() => {
                examined.push(document._id);
                return true;
              }),
            ),
          );
          const stream =
            stage === "leaf"
              ? observed
              : observed.pipe(
                  QueryStream.distinct(distinctFields),
                  QueryStream.reverse,
                );
          const fiber = yield* stream.pipe(
            QueryStream.mapEffect((document) =>
              Effect.sync(() => {
                processed++;
                return document;
              }),
            ),
            QueryStream.paginate({
              cursor: null,
              numItems: 10,
              maximumRowsRead: 10,
            }),
            Effect.forkScoped,
          );

          yield* Deferred.await(entered);
          expect(reader.runs[iterator]).toMatchObject({
            next: 1,
            returned: 0,
            settled: 0,
          });
          yield* Fiber.interrupt(fiber);
          expect(Exit.hasInterrupts(yield* Fiber.await(fiber))).toBe(true);
          expect(reader.runs).toHaveLength(iterator + 1);
          for (const run of reader.runs) expect(run.returned).toBe(1);
          expect(reader.runs[iterator]?.settled).toBe(0);
          expect(processed).toBe(0);
          expect(examined).toEqual(iterator === 1 ? ["b2"] : []);
          const eventsAfterInterruption = [...reader.events];

          yield* Deferred.succeed(release, undefined);
          yield* Deferred.await(settled);
          expect(reader.runs[iterator]?.settled).toBe(1);
          expect(reader.events).toEqual(eventsAfterInterruption);
          expect(processed).toBe(0);
          expect(examined).toEqual(iterator === 1 ? ["b2"] : []);
        }).pipe(Effect.scoped),
    );
  }
});
