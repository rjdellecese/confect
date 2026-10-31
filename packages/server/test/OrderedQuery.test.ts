import { Table } from "@confect/core";
import type * as DataModel from "@confect/server/DataModel";
import * as DatabaseSchema from "@confect/server/DatabaseSchema";
import * as Document from "@confect/server/Document";
import * as OrderedQuery from "@confect/server/OrderedQuery";
import { assert, describe, expect, it } from "@effect/vitest";
import type { OrderedQuery as ConvexOrderedQuery } from "convex/server";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { vi } from "vitest";

const notes = Table.make(() =>
  Schema.Struct({ value: Schema.FiniteFromString }),
)("notes");
const databaseSchema = DatabaseSchema.make({ notes });
type ConvexNotes = DataModel.ToConvex<
  DataModel.FromSchema<typeof databaseSchema>
>["notes"];

const note = (id: string, value: string) => ({
  _id: id,
  _creationTime: 1,
  value,
});

/**
 * A Convex query over `documents` that records how it is read.
 */
const makeQuery = (documents: ReadonlyArray<ReturnType<typeof note>>) => {
  const take = vi.fn((n: number) => Promise.resolve(documents.slice(0, n)));
  const iterate = vi.fn(() => {
    const iterator = documents[Symbol.iterator]();
    return { next: () => Promise.resolve(iterator.next()) };
  });
  const query = {
    take,
    [Symbol.asyncIterator]: iterate,
  } as unknown as ConvexOrderedQuery<ConvexNotes>;
  return { query, take, iterate };
};

const documents = [note("a", "1"), note("b", "2"), note("c", "3")];

describe("OrderedQuery", () => {
  it.effect("first takes only the query's first document", () =>
    Effect.gen(function* () {
      const { query, take, iterate } = makeQuery(documents);
      const read = OrderedQuery.make(query, notes).first();

      expect(take).not.toHaveBeenCalled();
      expect(yield* read).toEqual(
        Option.some({ _id: "a", _creationTime: 1, value: 1 }),
      );
      expect(take.mock.calls).toEqual([[1]]);
      expect(iterate).not.toHaveBeenCalled();

      const empty = OrderedQuery.make(makeQuery([]).query, notes);
      expect(yield* empty.first()).toEqual(Option.none());
    }),
  );

  it.effect("take limits the query to the documents it takes", () =>
    Effect.gen(function* () {
      const { query, take, iterate } = makeQuery(documents);
      const read = OrderedQuery.make(query, notes).take(2);

      expect(take).not.toHaveBeenCalled();
      expect((yield* read).map((doc) => doc.value)).toEqual([1, 2]);
      expect(take.mock.calls).toEqual([[2]]);
      expect(iterate).not.toHaveBeenCalled();
    }),
  );

  it.effect("take passes the count unchanged to Convex", () =>
    Effect.gen(function* () {
      for (const n of [
        0,
        -0,
        2.5,
        -1,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        Number.MAX_SAFE_INTEGER + 1,
      ]) {
        const { query, take, iterate } = makeQuery(documents);
        take.mockResolvedValueOnce([]);
        expect(yield* OrderedQuery.make(query, notes).take(n)).toEqual([]);
        expect(take.mock.calls).toEqual([[n]]);
        expect(iterate).not.toHaveBeenCalled();
      }
    }),
  );

  it.effect("take preserves Convex rejections as defects", () =>
    Effect.gen(function* () {
      const { query, take, iterate } = makeQuery(documents);
      const error = new TypeError("n must be a non-negative integer");
      take.mockRejectedValueOnce(error);

      const result = yield* OrderedQuery.make(query, notes)
        .take(2.5)
        .pipe(Effect.catchDefect(Effect.succeed));

      expect(result).toBe(error);
      expect(take.mock.calls).toEqual([[2.5]]);
      expect(iterate).not.toHaveBeenCalled();
    }),
  );

  it.effect("first and take fail on the first document that can't decode", () =>
    Effect.gen(function* () {
      const invalid = [note("a", "1"), note("b", "two"), note("c", "three")];

      const taken = yield* Effect.flip(
        OrderedQuery.make(makeQuery(invalid).query, notes).take(3),
      );
      const first = yield* Effect.flip(
        OrderedQuery.make(makeQuery(invalid.slice(1)).query, notes).first(),
      );

      for (const error of [taken, first]) {
        assert.instanceOf(error, Document.DocumentDecodeError);
        expect(error.id).toBe("b");
      }
    }),
  );
});
