import { FunctionSpec, Ref } from "@confect/core";
import { describe, expect, it } from "@effect/vitest";
import { ConvexError } from "convex/values";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { expectTypeOf } from "vitest";
import * as PaginatedQuery from "@confect/foldkit/PaginatedQuery";
import * as WebSocketClient from "@confect/foldkit/WebSocketClient";

const Note = Schema.Struct({ text: Schema.String });

const paginateRef = Ref.make(
  "notes",
  FunctionSpec.publicPaginatedQuery({
    name: "paginate",
    args: () => ({ channel: Schema.String }),
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
    returns: () => Schema.Struct({}),
  }),
);

const Notes = PaginatedQuery.make(paginateRef, Schema.String);

type Item = { readonly text: string };
type Args = { readonly channel: string };
type State = PaginatedQuery.State<Item, Args, string>;

const descriptor = (
  cursor: string | null,
  endCursor?: string,
): PaginatedQuery.PageDescriptor => ({
  cursor,
  endCursor: Match.value(endCursor).pipe(
    Match.withReturnType<Option.Option<string>>(),
    Match.when(undefined, () => Option.none()),
    Match.when(Match.defined, (definedEndCursor) =>
      Option.some(definedEndCursor),
    ),
    Match.exhaustive,
  ),
});

const pageResult = (
  page: ReadonlyArray<Item>,
  overrides?: Partial<PaginatedQuery.PageResult<Item>>,
): PaginatedQuery.PageResult<Item> => ({
  page,
  isDone: false,
  continueCursor: "c1",
  ...overrides,
});

const success = (
  state: State,
  page: ReadonlyArray<Item>,
  overrides?: Partial<PaginatedQuery.PageResult<Item>>,
): PaginatedQuery.Settlement<Item, Args, string> => ({
  request: PaginatedQuery.getRequest(state),
  result: Result.succeed(pageResult(page, overrides)),
});

const failure = (
  state: State,
  error: string,
): PaginatedQuery.Settlement<Item, Args, string> => ({
  request: PaginatedQuery.getRequest(state),
  result: Result.fail(error),
});

const initial = (): State =>
  Notes.init(
    { channel: "general" },
    {
      initialNumItems: 2,
      maximumRowsRead: 100,
      maximumBytesRead: 1_000,
    },
  );

const loadedPageOne = (): State => {
  const state = initial();
  return PaginatedQuery.settle(
    state,
    success(state, [{ text: "a" }, { text: "b" }]),
  );
};

const getPhase = <Tag extends State["phase"]["_tag"]>(
  state: State,
  tag: Tag,
): Extract<State["phase"], { readonly _tag: Tag }> => {
  expect(state.phase._tag).toBe(tag);
  return state.phase as Extract<State["phase"], { readonly _tag: Tag }>;
};

describe("PaginatedQuery", () => {
  describe("construction", () => {
    it("starts an identified request for page one", () => {
      const state = initial();

      expect(state.args).toEqual({ channel: "general" });
      expect(state.options).toEqual({
        initialNumItems: 2,
        maximumRowsRead: 100,
        maximumBytesRead: 1_000,
      });
      expect(state.paginationId).toBeGreaterThan(0);
      expect(state.current).toEqual(descriptor(null));
      expect(state.prevStack).toEqual([]);
      expect(state.phase).toEqual({
        _tag: "Loading",
        direction: "Initial",
      });
      expect(PaginatedQuery.getPage(state)).toEqual(Option.none());
      expect(PaginatedQuery.targetPageNumber(state)).toBe(1);
      expect(PaginatedQuery.isPending(state)).toBe(true);
    });

    it("omits the args parameter for a query without args", () => {
      const All = PaginatedQuery.make(paginateNoArgsRef, Schema.String);
      const state = All.init({ initialNumItems: 3 });
      const reinitialized = All.reinitialize(state, { initialNumItems: 4 });

      expect(state.args).toEqual({});
      expect(state.options.initialNumItems).toBe(3);
      expect(reinitialized.args).toEqual({});
      expect(reinitialized.options.initialNumItems).toBe(4);
    });

    it("validates page and read limits", () => {
      expect(() =>
        Notes.init({ channel: "general" }, { initialNumItems: 0 }),
      ).toThrow(/greater than 0/);
      expect(() =>
        Notes.init({ channel: "general" }, { initialNumItems: 1.5 }),
      ).toThrow(/integer/);
      expect(() =>
        Notes.init(
          { channel: "general" },
          { initialNumItems: 2, maximumRowsRead: -1 },
        ),
      ).toThrow(/greater than 0/);
    });

    it("reinitializes with new args and a fresh request identity", () => {
      const before = loadedPageOne();
      const state = Notes.reinitialize(before, { channel: "random" });

      expect(state.args).toEqual({ channel: "random" });
      expect(state.options).toEqual(before.options);
      expect(state.paginationId).not.toBe(before.paginationId);
      expect(state.phase).toEqual({
        _tag: "Loading",
        direction: "Initial",
      });

      const resized = Notes.reinitialize(
        before,
        { channel: "random" },
        { initialNumItems: 5 },
      );
      expect(resized.options).toEqual({ initialNumItems: 5 });
    });

    it("rejects refs without paginated provenance", () => {
      expect(() =>
        PaginatedQuery.make(
          standardQueryRef as unknown as Ref.AnyConfectPublicPaginatedQuery,
          Schema.String,
        ),
      ).toThrow(/FunctionSpec.publicPaginatedQuery/);
    });
  });

  describe("settle", () => {
    it("settles a success with a complete page", () => {
      const state = loadedPageOne();
      const phase = getPhase(state, "Success");

      expect(phase.data).toEqual({
        descriptor: descriptor(null),
        number: 1,
        items: [{ text: "a" }, { text: "b" }],
        continueCursor: "c1",
        isDone: false,
      });
      expect(PaginatedQuery.getItems(state)).toEqual(
        Option.some([{ text: "a" }, { text: "b" }]),
      );
      expect(PaginatedQuery.hasPage(state)).toBe(true);
      expect(PaginatedQuery.canNext(state)).toBe(true);
    });

    it("settles a cold failure as Failure and stores the error", () => {
      const before = initial();
      const state = PaginatedQuery.settle(before, failure(before, "offline"));

      expect(state.phase).toEqual({ _tag: "Failure", error: "offline" });
      expect(PaginatedQuery.getError(state)).toEqual(Option.some("offline"));
      expect(PaginatedQuery.hasPage(state)).toBe(false);
    });

    it("settles a refresh failure as Stale with the complete prior page", () => {
      const before = Option.getOrThrow(PaginatedQuery.next(loadedPageOne()));
      const state = PaginatedQuery.settle(before, failure(before, "offline"));
      const phase = getPhase(state, "Stale");

      expect(phase.error).toBe("offline");
      expect(phase.data.number).toBe(1);
      expect(phase.data.items).toEqual([{ text: "a" }, { text: "b" }]);
      expect(PaginatedQuery.hasError(state)).toBe(true);
    });

    it("supports the data-last form", () => {
      const before = initial();
      expect(
        PaginatedQuery.settle(success(before, [{ text: "a" }]))(before).phase
          ._tag,
      ).toBe("Success");
    });

    it("ignores both outcomes from a superseded request", () => {
      const pageOne = loadedPageOne();
      const oldRequest = PaginatedQuery.getRequest(pageOne);
      const navigated = Option.getOrThrow(PaginatedQuery.next(pageOne));
      const staleSuccess = {
        request: oldRequest,
        result: Result.succeed(pageResult([{ text: "late" }])),
      };
      const staleFailure = {
        request: oldRequest,
        result: Result.fail("late failure"),
      };

      expect(PaginatedQuery.settle(navigated, staleSuccess)).toEqual(navigated);
      expect(PaginatedQuery.settle(navigated, staleFailure)).toEqual(navigated);
    });

    it("ignores an outcome from an older pagination session", () => {
      const before = loadedPageOne();
      const oldSettlement = success(before, [{ text: "late" }]);
      const reset = PaginatedQuery.reset(before);

      expect(PaginatedQuery.settle(reset, oldSettlement)).toEqual(reset);
    });

    it("distinguishes separate requests for the same cursor range", () => {
      const pageOne = loadedPageOne();
      const firstPageOneRequest = PaginatedQuery.getRequest(pageOne);
      const loadingTwo = Option.getOrThrow(PaginatedQuery.next(pageOne));
      const pageTwo = PaginatedQuery.settle(
        loadingTwo,
        success(loadingTwo, [{ text: "c" }]),
      );
      const returningToPageOne = Option.getOrThrow(
        PaginatedQuery.prev(pageTwo),
      );
      const lateFirstPageOne = {
        request: firstPageOneRequest,
        result: Result.succeed(pageResult([{ text: "late" }])),
      };

      expect(returningToPageOne.current).toEqual(
        firstPageOneRequest.descriptor,
      );
      expect(returningToPageOne.requestId).not.toBe(
        firstPageOneRequest.requestId,
      );
      expect(
        PaginatedQuery.settle(returningToPageOne, lateFirstPageOne),
      ).toEqual(returningToPageOne);
    });

    it("ignores late outcomes after a failure closes the subscription", () => {
      const before = loadedPageOne();
      const failed = PaginatedQuery.settle(before, failure(before, "offline"));

      expect(
        PaginatedQuery.isCurrentRequest(
          failed,
          PaginatedQuery.getRequest(before),
        ),
      ).toBe(false);
      expect(PaginatedQuery.settle(failed, success(before, []))).toEqual(
        failed,
      );
    });
  });

  describe("navigation", () => {
    it("next targets the continuation cursor and refreshes over page one", () => {
      const state = Option.getOrThrow(PaginatedQuery.next(loadedPageOne()));
      const phase = getPhase(state, "Refreshing");

      expect(state.current).toEqual(descriptor("c1"));
      expect(state.prevStack).toEqual([descriptor(null)]);
      expect(phase.direction).toBe("Next");
      expect(phase.data.number).toBe(1);
      expect(PaginatedQuery.targetPageNumber(state)).toBe(2);
      expect(PaginatedQuery.getItems(state)).toEqual(
        Option.some([{ text: "a" }, { text: "b" }]),
      );
    });

    it("prev pops the cursor stack", () => {
      const loadingTwo = Option.getOrThrow(
        PaginatedQuery.next(loadedPageOne()),
      );
      const pageTwo = PaginatedQuery.settle(
        loadingTwo,
        success(loadingTwo, [{ text: "c" }], { continueCursor: "c2" }),
      );
      const state = Option.getOrThrow(PaginatedQuery.prev(pageTwo));

      expect(state.current).toEqual(descriptor(null));
      expect(state.prevStack).toEqual([]);
      expect(getPhase(state, "Refreshing").direction).toBe("Previous");
      expect(PaginatedQuery.getItems(state)).toEqual(
        Option.some([{ text: "c" }]),
      );
    });

    it("first returns to page one without replacing the session", () => {
      const loadingTwo = Option.getOrThrow(
        PaginatedQuery.next(loadedPageOne()),
      );
      const pageTwo = PaginatedQuery.settle(
        loadingTwo,
        success(loadingTwo, [{ text: "c" }]),
      );
      const state = Option.getOrThrow(PaginatedQuery.first(pageTwo));

      expect(state.paginationId).toBe(pageTwo.paginationId);
      expect(state.current).toEqual(descriptor(null));
      expect(state.prevStack).toEqual([]);
      expect(PaginatedQuery.first(loadedPageOne())).toEqual(Option.none());
    });

    it("does not navigate while pending or failed, or past either end", () => {
      expect(PaginatedQuery.next(initial())).toEqual(Option.none());
      expect(PaginatedQuery.prev(loadedPageOne())).toEqual(Option.none());

      const beforeLast = initial();
      const last = PaginatedQuery.settle(
        beforeLast,
        success(beforeLast, [{ text: "a" }], { isDone: true }),
      );
      expect(PaginatedQuery.next(last)).toEqual(Option.none());

      const beforeFailure = initial();
      const failed = PaginatedQuery.settle(
        beforeFailure,
        failure(beforeFailure, "offline"),
      );
      expect(PaginatedQuery.next(failed)).toEqual(Option.none());
      expect(PaginatedQuery.prev(failed)).toEqual(Option.none());
    });

    it("retreats automatically when a terminal page becomes empty", () => {
      const loadingTwo = Option.getOrThrow(
        PaginatedQuery.next(loadedPageOne()),
      );
      const state = PaginatedQuery.settle(
        loadingTwo,
        success(loadingTwo, [], { isDone: true }),
      );

      expect(state.current).toEqual(descriptor(null));
      expect(state.prevStack).toEqual([]);
      expect(getPhase(state, "Refreshing").direction).toBe("Previous");
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

    it("pins a recommended split and displays the complete delivered page", () => {
      const before = loadedPageOne();
      const state = PaginatedQuery.settle(
        before,
        success(before, bigPage, {
          splitCursor: "s",
          pageStatus: "SplitRecommended",
        }),
      );

      expect(state.current).toEqual(descriptor(null, "s"));
      expect(getPhase(state, "Refreshing").data.items).toEqual(bigPage);
    });

    it("withholds a potentially incomplete SplitRequired page", () => {
      const before = loadedPageOne();
      const state = PaginatedQuery.settle(
        before,
        success(before, bigPage, {
          splitCursor: "s",
          pageStatus: "SplitRequired",
        }),
      );

      expect(getPhase(state, "Refreshing").data.items).toEqual([
        { text: "a" },
        { text: "b" },
      ]);
    });

    it("uses the initial page size heuristic and requires a split cursor", () => {
      const before = loadedPageOne();
      const split = PaginatedQuery.settle(
        before,
        success(before, bigPage, { splitCursor: "s" }),
      );
      expect(split.current).toEqual(descriptor(null, "s"));

      const unsplit = PaginatedQuery.settle(
        before,
        success(before, bigPage, { pageStatus: "SplitRequired" }),
      );
      expect(unsplit.phase._tag).toBe("Success");
    });

    it("starts the page after a pin at the pin cursor", () => {
      const beforeSplit = loadedPageOne();
      const split = PaginatedQuery.settle(
        beforeSplit,
        success(beforeSplit, bigPage, {
          splitCursor: "s",
          pageStatus: "SplitRecommended",
        }),
      );
      const pinned = PaginatedQuery.settle(
        split,
        success(split, [{ text: "a" }], {
          continueCursor: "server-cursor",
        }),
      );
      const state = Option.getOrThrow(PaginatedQuery.next(pinned));

      expect(state.current).toEqual(descriptor("s"));
      expect(state.prevStack).toEqual([descriptor(null, "s")]);
    });
  });

  describe("recovery", () => {
    it("retry reopens Failure and Stale with a fresh pagination id", () => {
      const cold = initial();
      const failed = PaginatedQuery.settle(cold, failure(cold, "offline"));
      const retriedFailure = Option.getOrThrow(PaginatedQuery.retry(failed));
      expect(retriedFailure.phase).toEqual({
        _tag: "Loading",
        direction: "Retry",
      });
      expect(retriedFailure.paginationId).not.toBe(failed.paginationId);

      const loaded = loadedPageOne();
      const stale = PaginatedQuery.settle(loaded, failure(loaded, "offline"));
      const retriedStale = Option.getOrThrow(PaginatedQuery.retry(stale));
      expect(getPhase(retriedStale, "Refreshing").data.items).toHaveLength(2);
      expect(PaginatedQuery.retry(loadedPageOne())).toEqual(Option.none());
    });

    it("reset starts a new session at page one while retaining data", () => {
      const loadingTwo = Option.getOrThrow(
        PaginatedQuery.next(loadedPageOne()),
      );
      const pageTwo = PaginatedQuery.settle(
        loadingTwo,
        success(loadingTwo, [{ text: "c" }]),
      );
      const state = PaginatedQuery.reset(pageTwo);

      expect(state.args).toEqual(pageTwo.args);
      expect(state.options).toEqual(pageTwo.options);
      expect(state.paginationId).not.toBe(pageTwo.paginationId);
      expect(state.current).toEqual(descriptor(null));
      expect(state.prevStack).toEqual([]);
      expect(getPhase(state, "Refreshing").data.items).toEqual([{ text: "c" }]);
    });
  });

  describe("match and refinements", () => {
    it("dispatches exhaustively across all five phases", () => {
      const handlers = {
        onLoading: (phase: PaginatedQuery.Loading) => phase._tag,
        onRefreshing: (phase: PaginatedQuery.Refreshing<Item>) => phase._tag,
        onFailure: (phase: PaginatedQuery.Failure<string>) => phase._tag,
        onStale: (phase: PaginatedQuery.Stale<Item, string>) => phase._tag,
        onSuccess: (phase: PaginatedQuery.Success<Item>) => phase._tag,
      };
      const loading = initial();
      const successState = loadedPageOne();
      const refreshing = Option.getOrThrow(PaginatedQuery.next(successState));
      const failureState = PaginatedQuery.settle(
        loading,
        failure(loading, "offline"),
      );
      const staleState = PaginatedQuery.settle(
        successState,
        failure(successState, "offline"),
      );

      expect(PaginatedQuery.match(loading, handlers)).toBe("Loading");
      expect(PaginatedQuery.match(refreshing, handlers)).toBe("Refreshing");
      expect(PaginatedQuery.match(failureState, handlers)).toBe("Failure");
      expect(PaginatedQuery.match(staleState, handlers)).toBe("Stale");
      expect(PaginatedQuery.match(successState, handlers)).toBe("Success");
    });

    it("exposes tag predicates as refinements", () => {
      const state = loadedPageOne();
      const successfulState = [state].find(PaginatedQuery.isSuccess)!;
      expectTypeOf(successfulState.phase.data).toEqualTypeOf<
        PaginatedQuery.Page<Item>
      >();
      expect(PaginatedQuery.isLoading(initial())).toBe(true);
      expect(PaginatedQuery.isSuccess(state)).toBe(true);
      expect(PaginatedQuery.isRefreshing(state)).toBe(false);
    });
  });

  describe("schemas and inference", () => {
    it("round-trips every kind of state", () => {
      const loading = initial();
      const successState = PaginatedQuery.settle(
        loading,
        success(loading, [{ text: "a" }]),
      );
      const refreshing = Option.getOrThrow(PaginatedQuery.next(successState));
      const stale = PaginatedQuery.settle(
        refreshing,
        failure(refreshing, "offline"),
      );

      for (const state of [loading, successState, refreshing, stale]) {
        const encoded = Schema.encodeSync(Notes.schema)(state);
        expect(Schema.decodeUnknownSync(Notes.schema)(encoded)).toEqual(state);
      }
    });

    it("round-trips Result-based settlements", () => {
      const state = initial();
      for (const settlement of [
        success(state, [{ text: "a" }]),
        failure(state, "offline"),
      ]) {
        const encoded = Schema.encodeSync(Notes.settlement)(settlement);
        expect(Schema.decodeUnknownSync(Notes.settlement)(encoded)).toEqual(
          settlement,
        );
      }
    });

    it("infers item, args, error, and options", () => {
      expectTypeOf(Notes.init).parameters.toEqualTypeOf<
        [Args, PaginatedQuery.Options]
      >();
      expectTypeOf(Notes.schema.Type).toEqualTypeOf<State>();
      expectTypeOf(PaginatedQuery.getItems(loadedPageOne())).toEqualTypeOf<
        Option.Option<ReadonlyArray<Item>>
      >();
    });
  });

  describe("isInvalidCursor", () => {
    const invalidCursorError = new ConvexError({
      isConvexSystemError: true,
      paginationError: "InvalidCursor",
    });

    it("detects bare and transport-wrapped forms", () => {
      expect(PaginatedQuery.isInvalidCursor(invalidCursorError)).toBe(true);
      expect(
        PaginatedQuery.isInvalidCursor(
          new WebSocketClient.WebSocketClientError({
            cause: invalidCursorError,
          }),
        ),
      ).toBe(true);
      expect(
        PaginatedQuery.isInvalidCursor(
          new Error("InvalidCursor: cursor has expired"),
        ),
      ).toBe(true);
      expect(PaginatedQuery.isInvalidCursor(new Error("offline"))).toBe(false);
    });
  });
});
