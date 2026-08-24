import { FunctionSpec, Ref } from "@confect/core";
import { describe, expect, it } from "@effect/vitest";
import { ConvexError } from "convex/values";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { expectTypeOf } from "vitest";
import * as PaginatedQuery from "@confect/foldkit/PaginatedQuery";
import * as WebSocketClient from "@confect/foldkit/WebSocketClient";

const Note = Schema.Struct({ text: Schema.String });

const paginateRef = Ref.make(
  "notes",
  FunctionSpec.publicPaginatedQuery({
    name: "paginate",
    args: () => Schema.Struct({ channel: Schema.String }),
    item: () => Note,
  }),
);

const paginateNoArgsRef = Ref.make(
  "notes",
  FunctionSpec.publicPaginatedQuery({
    name: "paginateAll",
    item: () => Note,
  }),
);

const standardQueryRef = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "list",
    args: () => Schema.Struct({}),
    returns: () => Schema.Struct({}),
  }),
);

const Notes = PaginatedQuery.make(paginateRef);

type Item = { readonly text: string };
type State = PaginatedQuery.State<Item, { readonly channel: string }>;

const descriptor = (
  cursor: string | null,
  endCursor?: string,
): PaginatedQuery.PageDescriptor => ({
  cursor,
  endCursor: endCursor === undefined ? Option.none() : Option.some(endCursor),
});

const pageResult = (
  target: PaginatedQuery.PageDescriptor,
  page: ReadonlyArray<Item>,
  overrides?: Partial<PaginatedQuery.PageResult<Item>>,
): PaginatedQuery.PageResult<Item> => ({
  descriptor: target,
  page,
  isDone: false,
  continueCursor: "c1",
  ...overrides,
});

const initial = (): State =>
  Notes.init({ channel: "general" }, { numItems: 2 });

const loadedPageOne = (): State =>
  PaginatedQuery.settle(
    initial(),
    pageResult(descriptor(null), [{ text: "a" }, { text: "b" }]),
  );

describe("PaginatedQuery", () => {
  describe("init", () => {
    it("starts loading page one", () => {
      const state = initial();

      expect(state.args).toEqual({ channel: "general" });
      expect(state.numItems).toBe(2);
      expect(state.phase).toEqual({
        _tag: "Loading",
        current: descriptor(null),
        prevStack: [],
        previousItems: Option.none(),
        direction: "First",
      });
      expect(PaginatedQuery.page(state)).toEqual([]);
      expect(PaginatedQuery.pageNum(state)).toBe(1);
      expect(PaginatedQuery.isFirst(state)).toBe(true);
      expect(PaginatedQuery.canNext(state)).toBe(false);
      expect(PaginatedQuery.canPrev(state)).toBe(false);
    });

    it("omits the args parameter for a query without args", () => {
      const All = PaginatedQuery.make(paginateNoArgsRef);
      const state = All.init({ numItems: 3 });

      expect(state.args).toEqual({});
      expect(state.numItems).toBe(3);
    });

    it("rejects a non-positive numItems", () => {
      expect(() => Notes.init({ channel: "general" }, { numItems: 0 })).toThrow(
        /greater than zero/,
      );
    });
  });

  describe("settle", () => {
    it("loads the page a navigation was waiting for", () => {
      const state = loadedPageOne();

      expect(state.phase).toEqual({
        _tag: "Loaded",
        current: descriptor(null),
        prevStack: [],
        items: [{ text: "a" }, { text: "b" }],
        continueCursor: "c1",
        isDone: false,
      });
      expect(PaginatedQuery.page(state)).toEqual([
        { text: "a" },
        { text: "b" },
      ]);
      expect(PaginatedQuery.canNext(state)).toBe(true);
    });

    it("updates a live page in place", () => {
      const state = PaginatedQuery.settle(
        loadedPageOne(),
        pageResult(descriptor(null), [{ text: "a2" }, { text: "b" }], {
          continueCursor: "c1b",
        }),
      );

      expect(state.phase._tag).toBe("Loaded");
      expect(PaginatedQuery.page(state)).toEqual([
        { text: "a2" },
        { text: "b" },
      ]);
    });

    it("ignores a result for a superseded descriptor", () => {
      const navigated = Option.getOrThrow(PaginatedQuery.next(loadedPageOne()));

      const settled = PaginatedQuery.settle(
        navigated,
        pageResult(descriptor(null), [{ text: "stale" }]),
      );

      expect(settled).toEqual(navigated);
    });

    it("ignores a result after a failure", () => {
      const failed = PaginatedQuery.fail(loadedPageOne());

      const settled = PaginatedQuery.settle(
        failed,
        pageResult(descriptor(null), [{ text: "late" }]),
      );

      expect(settled).toEqual(failed);
    });

    it("supports the data-last form", () => {
      const settlePageOne = PaginatedQuery.settle(
        pageResult(descriptor(null), [{ text: "a" }]),
      );

      expect(settlePageOne(initial()).phase._tag).toBe("Loaded");
    });
  });

  describe("navigation", () => {
    it("next pushes the current page and targets continueCursor", () => {
      const state = Option.getOrThrow(PaginatedQuery.next(loadedPageOne()));

      expect(state.phase).toEqual({
        _tag: "Loading",
        current: descriptor("c1"),
        prevStack: [descriptor(null)],
        previousItems: Option.some([{ text: "a" }, { text: "b" }]),
        direction: "Next",
      });
      expect(PaginatedQuery.pageNum(state)).toBe(2);
      expect(PaginatedQuery.page(state)).toEqual([
        { text: "a" },
        { text: "b" },
      ]);
    });

    it("next is None while loading, when failed, and on the last page", () => {
      expect(PaginatedQuery.next(initial())).toEqual(Option.none());
      expect(PaginatedQuery.next(PaginatedQuery.fail(loadedPageOne()))).toEqual(
        Option.none(),
      );

      const lastPage = PaginatedQuery.settle(
        initial(),
        pageResult(descriptor(null), [{ text: "a" }], { isDone: true }),
      );
      expect(PaginatedQuery.isLast(lastPage)).toBe(true);
      expect(PaginatedQuery.next(lastPage)).toEqual(Option.none());
    });

    it("prev pops the stack", () => {
      const pageTwo = PaginatedQuery.settle(
        Option.getOrThrow(PaginatedQuery.next(loadedPageOne())),
        pageResult(descriptor("c1"), [{ text: "c" }], {
          continueCursor: "c2",
        }),
      );

      const state = Option.getOrThrow(PaginatedQuery.prev(pageTwo));

      expect(state.phase).toEqual({
        _tag: "Loading",
        current: descriptor(null),
        prevStack: [],
        previousItems: Option.some([{ text: "c" }]),
        direction: "Prev",
      });
      expect(PaginatedQuery.pageNum(state)).toBe(1);
    });

    it("prev is None on the first page and while loading", () => {
      expect(PaginatedQuery.prev(loadedPageOne())).toEqual(Option.none());
      expect(PaginatedQuery.prev(initial())).toEqual(Option.none());
    });
  });

  describe("splits", () => {
    const bigPage = [
      { text: "a" },
      { text: "b" },
      { text: "c" },
      { text: "d" },
      { text: "e" },
    ];

    it("SplitRecommended pins the page and keeps showing the delivered items", () => {
      const state = PaginatedQuery.settle(
        loadedPageOne(),
        pageResult(descriptor(null), bigPage, {
          splitCursor: "s",
          pageStatus: "SplitRecommended",
        }),
      );

      expect(state.phase).toEqual({
        _tag: "Loading",
        current: descriptor(null, "s"),
        prevStack: [],
        previousItems: Option.some(bigPage),
        direction: "Split",
      });
    });

    it("SplitRequired pins the page but keeps the prior display items", () => {
      const state = PaginatedQuery.settle(
        loadedPageOne(),
        pageResult(descriptor(null), bigPage, {
          splitCursor: "s",
          pageStatus: "SplitRequired",
        }),
      );

      expect(state.phase._tag).toBe("Loading");
      // The delivered page may be incomplete — show what was already loaded.
      expect(PaginatedQuery.page(state)).toEqual([
        { text: "a" },
        { text: "b" },
      ]);
    });

    it("splits on the page-size heuristic without a pageStatus", () => {
      const state = PaginatedQuery.settle(
        loadedPageOne(),
        pageResult(descriptor(null), bigPage, { splitCursor: "s" }),
      );

      expect(state.phase._tag).toBe("Loading");
      expect(
        state.phase._tag === "Loading" ? state.phase.current : undefined,
      ).toEqual(descriptor(null, "s"));
    });

    it("does not split without a splitCursor, even when SplitRequired", () => {
      const state = PaginatedQuery.settle(
        loadedPageOne(),
        pageResult(descriptor(null), bigPage, {
          pageStatus: "SplitRequired",
        }),
      );

      expect(state.phase._tag).toBe("Loaded");
    });

    it("next from a pinned page starts at the pin, not continueCursor", () => {
      const pinned = PaginatedQuery.settle(
        PaginatedQuery.settle(
          loadedPageOne(),
          pageResult(descriptor(null), bigPage, {
            splitCursor: "s",
            pageStatus: "SplitRecommended",
          }),
        ),
        pageResult(descriptor(null, "s"), [{ text: "a" }, { text: "b" }], {
          continueCursor: "server-said-something-else",
        }),
      );
      expect(pinned.phase._tag).toBe("Loaded");

      const state = Option.getOrThrow(PaginatedQuery.next(pinned));

      expect(
        state.phase._tag === "Loading" ? state.phase.current : undefined,
      ).toEqual(descriptor("s"));
      expect(
        state.phase._tag === "Loading" ? state.phase.prevStack : undefined,
      ).toEqual([descriptor(null, "s")]);
    });

    it("prev re-runs a previously split page with its pinned range", () => {
      const pinnedLoaded = PaginatedQuery.settle(
        PaginatedQuery.settle(
          loadedPageOne(),
          pageResult(descriptor(null), bigPage, {
            splitCursor: "s",
            pageStatus: "SplitRecommended",
          }),
        ),
        pageResult(descriptor(null, "s"), [{ text: "a" }]),
      );
      const pageTwo = PaginatedQuery.settle(
        Option.getOrThrow(PaginatedQuery.next(pinnedLoaded)),
        pageResult(descriptor("s"), [{ text: "f" }]),
      );

      const state = Option.getOrThrow(PaginatedQuery.prev(pageTwo));

      expect(
        state.phase._tag === "Loading" ? state.phase.current : undefined,
      ).toEqual(descriptor(null, "s"));
    });

    it("a second split re-pins an already-pinned page", () => {
      const pinnedLoaded = PaginatedQuery.settle(
        PaginatedQuery.settle(
          loadedPageOne(),
          pageResult(descriptor(null), bigPage, {
            splitCursor: "s",
            pageStatus: "SplitRecommended",
          }),
        ),
        pageResult(descriptor(null, "s"), bigPage),
      );

      const state = PaginatedQuery.settle(
        pinnedLoaded,
        pageResult(descriptor(null, "s"), bigPage, {
          splitCursor: "s2",
          pageStatus: "SplitRequired",
        }),
      );

      expect(
        state.phase._tag === "Loading" ? state.phase.current : undefined,
      ).toEqual(descriptor(null, "s2"));
      // SplitRequired keeps the last complete render.
      expect(PaginatedQuery.page(state)).toEqual(bigPage);
    });
  });

  describe("fail, retry, reset", () => {
    it("fail keeps the position and last items, and closes navigation", () => {
      const state = PaginatedQuery.fail(loadedPageOne());

      expect(state.phase).toEqual({
        _tag: "Failed",
        current: descriptor(null),
        prevStack: [],
        previousItems: Option.some([{ text: "a" }, { text: "b" }]),
      });
      expect(PaginatedQuery.page(state)).toEqual([
        { text: "a" },
        { text: "b" },
      ]);
      expect(PaginatedQuery.isFailed(state)).toBe(true);
      expect(PaginatedQuery.fail(state)).toEqual(state);
    });

    it("retry reopens at the same page", () => {
      const failed = PaginatedQuery.fail(loadedPageOne());

      const state = Option.getOrThrow(PaginatedQuery.retry(failed));

      expect(state.phase).toEqual({
        _tag: "Loading",
        current: descriptor(null),
        prevStack: [],
        previousItems: Option.some([{ text: "a" }, { text: "b" }]),
        direction: "Retry",
      });
      expect(PaginatedQuery.retry(loadedPageOne())).toEqual(Option.none());
    });

    it("reset returns to page one, keeping args and numItems", () => {
      const pageTwo = PaginatedQuery.settle(
        Option.getOrThrow(PaginatedQuery.next(loadedPageOne())),
        pageResult(descriptor("c1"), [{ text: "c" }]),
      );

      const state = PaginatedQuery.reset(pageTwo);

      expect(state.args).toEqual({ channel: "general" });
      expect(state.numItems).toBe(2);
      expect(state.phase).toEqual(initial().phase);
    });
  });

  describe("match", () => {
    it("dispatches on the phase", () => {
      const onPhase = {
        onLoading: (loading: PaginatedQuery.Loading<Item>) =>
          `loading:${loading.direction}`,
        onLoaded: (loaded: PaginatedQuery.Loaded<Item>) =>
          `loaded:${loaded.items.length}`,
        onFailed: () => "failed",
      };

      expect(PaginatedQuery.match(initial(), onPhase)).toBe("loading:First");
      expect(PaginatedQuery.match(loadedPageOne(), onPhase)).toBe("loaded:2");
      expect(
        PaginatedQuery.match(PaginatedQuery.fail(loadedPageOne()), onPhase),
      ).toBe("failed");
    });
  });

  describe("make", () => {
    it("round-trips the state through its schema", () => {
      const pageTwo = PaginatedQuery.settle(
        Option.getOrThrow(PaginatedQuery.next(loadedPageOne())),
        pageResult(descriptor("c1"), [{ text: "c" }]),
      );

      for (const state of [initial(), pageTwo, PaginatedQuery.fail(pageTwo)]) {
        const encoded = Schema.encodeSync(Notes.schema)(state);
        expect(Schema.decodeUnknownSync(Notes.schema)(encoded)).toEqual(state);
      }
    });

    it("treats structurally equal states as equivalent", () => {
      const equivalence = Schema.toEquivalence(Notes.schema);

      expect(equivalence(loadedPageOne(), loadedPageOne())).toBe(true);
      expect(
        equivalence(
          loadedPageOne(),
          Option.getOrThrow(PaginatedQuery.next(loadedPageOne())),
        ),
      ).toBe(false);
    });

    it("round-trips a PageResult through its schema", () => {
      const result = pageResult(descriptor(null, "s"), [{ text: "a" }], {
        splitCursor: "s2",
        pageStatus: "SplitRecommended",
      });

      const encoded = Schema.encodeSync(Notes.pageResult)(result);
      expect(Schema.decodeUnknownSync(Notes.pageResult)(encoded)).toEqual(
        result,
      );
    });

    it("rejects refs without paginated provenance", () => {
      expect(() =>
        PaginatedQuery.make(
          standardQueryRef as unknown as Ref.AnyConfectPublicPaginatedQuery,
        ),
      ).toThrow(/FunctionSpec.publicPaginatedQuery/);
    });

    it("infers the item and args types from the ref", () => {
      expectTypeOf(Notes.init).parameters.toEqualTypeOf<
        [{ readonly channel: string }, { readonly numItems: number }]
      >();
      const state = loadedPageOne();
      expectTypeOf(PaginatedQuery.page(state)).toEqualTypeOf<
        ReadonlyArray<{ readonly text: string }>
      >();
    });
  });

  describe("isInvalidCursor", () => {
    const invalidCursorError = new ConvexError({
      isConvexSystemError: true,
      paginationError: "InvalidCursor",
    });

    it("detects the system error, bare and wrapped", () => {
      expect(PaginatedQuery.isInvalidCursor(invalidCursorError)).toBe(true);
      expect(
        PaginatedQuery.isInvalidCursor(
          new WebSocketClient.WebSocketClientError({
            cause: invalidCursorError,
          }),
        ),
      ).toBe(true);
    });

    it("detects the message form, bare and wrapped", () => {
      const error = new Error("InvalidCursor: cursor has expired");
      expect(PaginatedQuery.isInvalidCursor(error)).toBe(true);
      expect(
        PaginatedQuery.isInvalidCursor(
          new WebSocketClient.WebSocketClientError({ cause: error }),
        ),
      ).toBe(true);
    });

    it("rejects unrelated errors", () => {
      expect(PaginatedQuery.isInvalidCursor(new Error("network down"))).toBe(
        false,
      );
      expect(
        PaginatedQuery.isInvalidCursor(new ConvexError({ code: "other" })),
      ).toBe(false);
      expect(
        PaginatedQuery.isInvalidCursor(
          new WebSocketClient.WebSocketClientError({ cause: "boom" }),
        ),
      ).toBe(false);
    });
  });
});
