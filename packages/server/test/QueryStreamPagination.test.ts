import * as Pagination from "@confect/server/QueryStreamPagination";
import * as Key from "@confect/server/QueryStreamKey";
import * as Layout from "@confect/server/QueryStreamKeyLayout";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Array from "effect/Array";
import type * as Chunk from "effect/Chunk";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Result from "effect/Result";

const layout = Result.getOrThrow(Layout.fromIndex(["_id"]));
const key = (value: number) => Result.getOrThrow(Key.complete(layout, [value]));
const request = (
  numItems = 2,
  range: Pagination.Range = Pagination.Range.Unpinned(),
): Pagination.ScanRequest => {
  const parsed = Result.getOrThrow(
    Pagination.parseRequest(numItems, Pagination.Start.Beginning(), range),
  );
  return Match.value(parsed).pipe(
    Match.tagsExhaustive({
      Scan: (scan) => scan,
      Unchanged: () => {
        throw new Pagination.EmptyInitialPageError();
      },
    }),
  );
};
const scan = (req: Pagination.ScanRequest, count: number, filtered = false) =>
  Array.reduce(
    Array.drop(Array.range(0, count), 1),
    Pagination.initial<number>(),
    (state, value) =>
      Pagination.record(
        req,
        state,
        filtered ? Option.none() : Option.some(value),
        key(value),
        false,
      ),
  );

describe("QueryStreamPagination", () => {
  it("requires progress in each stopped variant", () => {
    type Stopped = Extract<
      Pagination.QueryStreamPagination<number>,
      { readonly _tag: "ItemLimit" | "ReadLimit" }
    >;
    expectTypeOf<Stopped["progress"]>().toEqualTypeOf<
      Chunk.NonEmptyChunk<Key.Complete>
    >();
    expectTypeOf<{
      readonly _tag: "After";
      readonly cursor: string;
    }>().not.toExtend<Pagination.Start>();
    expectTypeOf<{
      readonly _tag: "After";
      readonly orderKey: Key.Complete;
    }>().not.toExtend<Pagination.Start>();
  });

  it.each([-1, 1.5, NaN, Infinity])(
    "rejects invalid page size %s",
    (numItems) => {
      const parsed = Pagination.parseRequest(
        numItems,
        Pagination.Start.Beginning(),
        Pagination.Range.Unpinned(),
      );
      expect(Result.isFailure(parsed)).toBe(true);
      if (Result.isFailure(parsed))
        expect(parsed.failure).toBeInstanceOf(Pagination.InvalidPageSizeError);
    },
  );

  it("parses zero-sized continuation requests without manufacturing an initial cursor", () => {
    expect(
      Result.getOrThrow(
        Pagination.parseRequest(
          0,
          Pagination.Start.After({ cursor: "original", orderKey: key(1) }),
          Pagination.Range.Unpinned(),
        ),
      ),
    ).toEqual({ _tag: "Unchanged", cursor: "original" });
    const initial = Pagination.parseRequest(
      0,
      Pagination.Start.Beginning(),
      Pagination.Range.Unpinned(),
    );
    expect(Result.isFailure(initial)).toBe(true);
    if (Result.isFailure(initial))
      expect(initial.failure).toBeInstanceOf(Pagination.EmptyInitialPageError);
  });

  it("distinguishes item-limit progress from exhaustion", () => {
    const req = request();
    expect(
      Result.getOrThrow(Pagination.finish(req, scan(req, 1), false)),
    ).toMatchObject({ _tag: "Done", page: [1] });
    const stopped = scan(req, 5);
    expect(stopped._tag).toBe("ItemLimit");
    expect(Result.getOrThrow(Pagination.finish(req, stopped, false))).toEqual({
      _tag: "Continue",
      page: [1, 2],
      orderKey: key(2),
    });
  });

  it("reads pinned ranges past the requested item count", () => {
    for (const range of [
      Pagination.Range.ThroughKey({ orderKey: key(9) }),
      Pagination.Range.ThroughEnd(),
    ]) {
      const req = request(2, range);
      const state = scan(req, 4);
      expect(state._tag).toBe("Reading");
      expect(Result.getOrThrow(Pagination.finish(req, state, false))).toEqual({
        _tag: "SplitRecommended",
        page: [1, 2, 3, 4],
        splitOrderKey: key(2),
        continuation:
          range._tag === "ThroughKey"
            ? { _tag: "Key", orderKey: key(9) }
            : { _tag: "End" },
      });
    }
  });

  it("requires safe progress and an interior split when a budget stops a page", () => {
    const req = request();
    const empty = Pagination.finish(req, Pagination.initial(), true);
    expect(Result.isFailure(empty)).toBe(true);
    if (Result.isFailure(empty))
      expect(empty.failure.reason).toBe("NoProgress");
    const pinned = request(
      2,
      Pagination.Range.ThroughKey({ orderKey: key(1) }),
    );
    const boundary = Pagination.finish(pinned, scan(pinned, 1), true);
    expect(Result.isFailure(boundary)).toBe(true);
    if (Result.isFailure(boundary))
      expect(boundary.failure.reason).toBe("NoInteriorSplit");
    expect(
      Result.getOrThrow(Pagination.finish(req, scan(req, 1, true), true)),
    ).toEqual({
      _tag: "SplitRequired",
      page: [],
      continuation: { _tag: "Key", orderKey: key(1) },
      splitOrderKey: key(1),
    });
  });

  it("gives read limits precedence over item limits", () => {
    const req = request(1);
    const state = Pagination.record(
      req,
      Pagination.initial(),
      Option.some(1),
      key(1),
      true,
    );
    expect(state._tag).toBe("ReadLimit");
    expect(Result.getOrThrow(Pagination.finish(req, state, false))._tag).toBe(
      "SplitRequired",
    );
  });
});
