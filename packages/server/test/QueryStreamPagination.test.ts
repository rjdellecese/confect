import * as Pagination from "@confect/server/QueryStreamPagination";
import * as Key from "@confect/server/QueryStreamKey";
import * as Layout from "@confect/server/QueryStreamKeyLayout";
import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Result from "effect/Result";

const layout = Result.getOrThrow(Layout.fromIndex(["_id"]));
const key = (value: number) => Result.getOrThrow(Key.complete(layout, [value]));
const request = (
  numItems = 2,
  range: Pagination.Range = Pagination.Range.Unpinned(),
): Pagination.ScanRequest => {
  const parsed = Result.getOrThrow(
    Pagination.parseRequest(numItems, null, Option.none(), range),
  );
  if (parsed._tag === "Unchanged") throw new Error("Expected a scan request");
  return parsed;
};
const scan = (req: Pagination.ScanRequest, count: number, filtered = false) =>
  Array.from({ length: count }, (_, index) => index + 1).reduce(
    (state, value) =>
      Pagination.record(
        req,
        state,
        filtered ? Option.none() : Option.some(value),
        key(value),
        false,
      ),
    Pagination.initial<number>(),
  );

describe("QueryStreamPagination", () => {
  it.each([-1, 1.5, NaN, Infinity])(
    "rejects invalid page size %s",
    (numItems) => {
      const parsed = Pagination.parseRequest(
        numItems,
        null,
        Option.none(),
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
          "original",
          Option.some(key(1)),
          Pagination.Range.Unpinned(),
        ),
      ),
    ).toEqual({ _tag: "Unchanged", cursor: "original" });
    const initial = Pagination.parseRequest(
      0,
      null,
      Option.none(),
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
      key: key(2),
    });
  });

  it("reads pinned ranges past the requested item count", () => {
    for (const range of [
      Pagination.Range.ThroughKey({ key: key(9) }),
      Pagination.Range.ThroughEnd(),
    ]) {
      const req = request(2, range);
      const state = scan(req, 4);
      expect(state._tag).toBe("Reading");
      expect(Result.getOrThrow(Pagination.finish(req, state, false))).toEqual({
        _tag: "SplitRecommended",
        page: [1, 2, 3, 4],
        split: key(2),
        continuation:
          range._tag === "ThroughKey"
            ? Pagination.Continuation.Key({ key: key(9) })
            : Pagination.Continuation.End(),
      });
    }
  });

  it("requires safe progress and an interior split when a budget stops a page", () => {
    const req = request();
    const empty = Pagination.finish(req, Pagination.initial(), true);
    expect(Result.isFailure(empty)).toBe(true);
    if (Result.isFailure(empty))
      expect(empty.failure.reason).toBe("NoProgress");
    const pinned = request(2, Pagination.Range.ThroughKey({ key: key(1) }));
    const boundary = Pagination.finish(pinned, scan(pinned, 1), true);
    expect(Result.isFailure(boundary)).toBe(true);
    if (Result.isFailure(boundary))
      expect(boundary.failure.reason).toBe("NoInteriorSplit");
    expect(
      Result.getOrThrow(Pagination.finish(req, scan(req, 1, true), true)),
    ).toEqual({
      _tag: "SplitRequired",
      page: [],
      continuation: Pagination.Continuation.Key({ key: key(1) }),
      split: key(1),
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
