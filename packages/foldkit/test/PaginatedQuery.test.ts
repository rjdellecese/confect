import { FunctionSpec, PaginationError, Ref } from "@confect/core";
import { describe, expect, it } from "@effect/vitest";
import type * as Data from "effect/Data";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { expectTypeOf } from "vitest";
import * as Client from "@confect/foldkit/Client";
import * as PaginatedQuery from "@confect/foldkit/PaginatedQuery";

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

const Notes = PaginatedQuery.make(paginateRef);

type Item = { readonly text: string };
type Args = { readonly channel: string };
type PageError = PaginatedQuery.Error<typeof paginateRef>;
type State = PaginatedQuery.State<Item, Args, PageError>;
type Active = PaginatedQuery.Active<Item, Args, PageError>;

const descriptor = (
  cursor: string | null,
  endCursor?: string,
): PaginatedQuery.PageDescriptor => ({
  cursor,
  endCursor: Match.value(endCursor).pipe(
    Match.withReturnType<Option.Option<string>>(),
    Match.when(undefined, () => Option.none<string>()),
    Match.when(Match.defined, (value: string) => Option.some(value)),
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

const request = (
  state: Active,
  paginationId = Option.getOrElse(state.paginationId, () => 1),
): PaginatedQuery.Request<Args> =>
  PaginatedQuery.allocateRequest(
    PaginatedQuery.getSubscriptionRequest(state),
    paginationId,
  );

const success = (
  state: Active,
  page: ReadonlyArray<Item>,
  overrides?: Partial<PaginatedQuery.PageResult<Item>>,
): PaginatedQuery.Settlement<Item, Args, PageError> => ({
  request: request(state),
  result: Result.succeed(pageResult(page, overrides)),
});

const failure = (
  state: Active,
  error: PageError,
): PaginatedQuery.Settlement<Item, Args, PageError> => ({
  request: request(state),
  result: Result.fail(error),
});

const offline = () => new Client.WebSocketClientError({ cause: "offline" });

const initial = (): Active =>
  Notes.init(
    Notes.idle,
    { channel: "general" },
    {
      initialNumItems: 2,
      maximumRowsRead: 100,
      maximumBytesRead: 1_000,
    },
  );

const loadedPageOne = (): Active => {
  const state = initial();
  return PaginatedQuery.settle(
    state,
    success(state, [{ text: "a" }, { text: "b" }]),
  ) as Active;
};

const getPhase = <Tag extends Active["phase"]["_tag"]>(
  state: Active,
  tag: Tag,
): Data.TaggedEnum.Value<Active["phase"], Tag> => {
  expect(state.phase._tag).toBe(tag);
  return state.phase as Data.TaggedEnum.Value<Active["phase"], Tag>;
};

describe("PaginatedQuery", () => {
  describe("construction", () => {
    it("starts idle and initializes page one without allocating a client id", () => {
      expect(Notes.idle).toEqual({ _tag: "Idle", generation: 0 });

      const state = initial();
      expect(state.args).toEqual({ channel: "general" });
      expect(state.options).toEqual({
        initialNumItems: 2,
        maximumRowsRead: 100,
        maximumBytesRead: 1_000,
      });
      expect(state.generation).toBe(1);
      expect(state.paginationId).toEqual(Option.none());
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

    it("retains a generation tombstone across close and reopen", () => {
      const first = initial();
      const idle = PaginatedQuery.close(first);
      const reopened = Notes.init(
        idle,
        { channel: "general" },
        { initialNumItems: 2 },
      );

      expect(idle).toEqual({ _tag: "Idle", generation: 1 });
      expect(reopened.generation).toBe(2);
      expect(PaginatedQuery.settle(reopened, success(first, []))).toEqual(
        reopened,
      );
      expect(PaginatedQuery.settle(idle, success(first, []))).toEqual(idle);
    });

    it("omits the args parameter for a query without user args", () => {
      const All = PaginatedQuery.make(paginateNoArgsRef);
      const state = All.init(All.idle, { initialNumItems: 3 });
      const reinitialized = All.reinitialize(state, { initialNumItems: 4 });

      expect(state.args).toEqual({});
      expect(state.options.initialNumItems).toBe(3);
      expect(reinitialized.args).toEqual({});
      expect(reinitialized.options.initialNumItems).toBe(4);
      expect(reinitialized.generation).toBe(2);
    });

    it("validates page and read limits synchronously", () => {
      expect(() =>
        Notes.init(Notes.idle, { channel: "general" }, { initialNumItems: 0 }),
      ).toThrow(/greater than 0/);
      expect(() =>
        Notes.init(
          Notes.idle,
          { channel: "general" },
          { initialNumItems: 1.5 },
        ),
      ).toThrow(/integer/);
      expect(() =>
        Notes.init(
          Notes.idle,
          { channel: "general" },
          { initialNumItems: 2, maximumRowsRead: -1 },
        ),
      ).toThrow(/greater than 0/);
    });

    it("reinitializes with new args and a fresh logical session", () => {
      const before = loadedPageOne();
      const state = Notes.reinitialize(before, { channel: "random" });
      const resized = Notes.reinitialize(
        before,
        { channel: "random" },
        { initialNumItems: 5 },
      );

      expect(state.args).toEqual({ channel: "random" });
      expect(state.options).toEqual(before.options);
      expect(state.generation).toBe(before.generation + 1);
      expect(state.paginationId).toEqual(Option.none());
      expect(state.phase).toEqual({
        _tag: "Loading",
        direction: "Initial",
      });
      expect(resized.options).toEqual({ initialNumItems: 5 });
    });

    it("rejects refs without paginated provenance", () => {
      expect(() =>
        PaginatedQuery.make(
          standardQueryRef as unknown as Ref.AnyConfectPublicPaginatedQuery,
        ),
      ).toThrow(/FunctionSpec.publicPaginatedQuery/);
    });
  });

  describe("settle", () => {
    it("installs the allocated id and settles a complete page atomically", () => {
      const before = initial();
      const state = PaginatedQuery.settle(
        before,
        success(before, [{ text: "a" }, { text: "b" }]),
      ) as Active;
      const phase = getPhase(state, "Success");

      expect(state.paginationId).toEqual(Option.some(1));
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
      expect(PaginatedQuery.canNext(state)).toBe(true);
    });

    it("keeps a failed request current so a later emission can recover", () => {
      const before = initial();
      const subscribedRequest = request(before, 7);
      const error = offline();
      const failed = PaginatedQuery.settle(before, {
        request: subscribedRequest,
        result: Result.fail(error),
      }) as Active;

      expect(failed.paginationId).toEqual(Option.some(7));
      expect(failed.phase).toEqual({ _tag: "Failure", error });
      expect(PaginatedQuery.isCurrentRequest(failed, subscribedRequest)).toBe(
        true,
      );

      const recovered = PaginatedQuery.settle(failed, {
        request: subscribedRequest,
        result: Result.succeed(pageResult([{ text: "recovered" }])),
      }) as Active;
      expect(getPhase(recovered, "Success").data.items).toEqual([
        { text: "recovered" },
      ]);
    });

    it("settles a refresh failure as Stale with the prior page", () => {
      const before = Option.getOrThrow(PaginatedQuery.next(loadedPageOne()));
      const error = offline();
      const state = PaginatedQuery.settle(before, failure(before, error));

      expect(PaginatedQuery.isStale(state)).toBe(true);
      if (PaginatedQuery.isStale(state)) {
        expect(state.phase.error).toBe(error);
        expect(state.phase.data.items).toEqual([{ text: "a" }, { text: "b" }]);
      }
    });

    it("automatically resets an invalid cursor into a fresh session", () => {
      const before = Option.getOrThrow(PaginatedQuery.next(loadedPageOne()));
      const settlement = failure(
        before,
        new PaginationError.InvalidCursor({ cause: "expired" }),
      );
      const decodedSettlement = Schema.decodeUnknownSync(Notes.settlement)(
        Schema.encodeSync(Notes.settlement)(settlement),
      );
      const state = PaginatedQuery.settle(before, decodedSettlement) as Active;

      expect(state.generation).toBe(before.generation + 1);
      expect(state.paginationId).toEqual(Option.none());
      expect(state.requestId).toBe(1);
      expect(state.current).toEqual(descriptor(null));
      expect(state.prevStack).toEqual([]);
      expect(getPhase(state, "Refreshing").direction).toBe("Reset");
      expect(PaginatedQuery.getError(state)).toEqual(Option.none());
    });

    it("ignores outcomes from superseded requests and sessions", () => {
      const pageOne = loadedPageOne();
      const oldSettlement = success(pageOne, [{ text: "late" }]);
      const navigated = Option.getOrThrow(PaginatedQuery.next(pageOne));
      const reset = PaginatedQuery.reset(pageOne);

      expect(PaginatedQuery.settle(navigated, oldSettlement)).toEqual(
        navigated,
      );
      expect(PaginatedQuery.settle(reset, oldSettlement)).toEqual(reset);
    });

    it("distinguishes separate requests for the same cursor range", () => {
      const pageOne = loadedPageOne();
      const firstPageRequest = request(pageOne);
      const loadingTwo = Option.getOrThrow(PaginatedQuery.next(pageOne));
      const pageTwo = PaginatedQuery.settle(
        loadingTwo,
        success(loadingTwo, [{ text: "c" }]),
      ) as Active;
      const returning = Option.getOrThrow(PaginatedQuery.prev(pageTwo));

      expect(returning.current).toEqual(firstPageRequest.descriptor);
      expect(returning.requestId).not.toBe(firstPageRequest.requestId);
      expect(
        PaginatedQuery.settle(returning, {
          request: firstPageRequest,
          result: Result.succeed(pageResult([{ text: "late" }])),
        }),
      ).toEqual(returning);
    });

    it("supports the data-last form", () => {
      const before = initial();
      const state = PaginatedQuery.settle(success(before, [{ text: "a" }]))(
        before,
      );
      expect(PaginatedQuery.isSuccess(state)).toBe(true);
    });
  });

  describe("navigation", () => {
    it("next targets the continuation cursor while retaining page one", () => {
      const state = Option.getOrThrow(PaginatedQuery.next(loadedPageOne()));
      const phase = getPhase(state, "Refreshing");

      expect(state.current).toEqual(descriptor("c1"));
      expect(state.prevStack).toEqual([descriptor(null)]);
      expect(phase.direction).toBe("Next");
      expect(phase.data.number).toBe(1);
      expect(PaginatedQuery.targetPageNumber(state)).toBe(2);
    });

    it("prev pops the cursor stack", () => {
      const loadingTwo = Option.getOrThrow(
        PaginatedQuery.next(loadedPageOne()),
      );
      const pageTwo = PaginatedQuery.settle(
        loadingTwo,
        success(loadingTwo, [{ text: "c" }], { continueCursor: "c2" }),
      ) as Active;
      const state = Option.getOrThrow(PaginatedQuery.prev(pageTwo));

      expect(state.current).toEqual(descriptor(null));
      expect(state.prevStack).toEqual([]);
      expect(getPhase(state, "Refreshing").direction).toBe("Previous");
    });

    it("first returns to page one without replacing the session", () => {
      const loadingTwo = Option.getOrThrow(
        PaginatedQuery.next(loadedPageOne()),
      );
      const pageTwo = PaginatedQuery.settle(
        loadingTwo,
        success(loadingTwo, [{ text: "c" }]),
      ) as Active;
      const state = Option.getOrThrow(PaginatedQuery.first(pageTwo));

      expect(state.paginationId).toEqual(pageTwo.paginationId);
      expect(state.generation).toBe(pageTwo.generation);
      expect(state.current).toEqual(descriptor(null));
      expect(PaginatedQuery.first(loadedPageOne())).toEqual(Option.none());
    });

    it("does not navigate while pending, failed, or past either end", () => {
      expect(PaginatedQuery.next(initial())).toEqual(Option.none());
      expect(PaginatedQuery.prev(loadedPageOne())).toEqual(Option.none());

      const beforeLast = initial();
      const last = PaginatedQuery.settle(
        beforeLast,
        success(beforeLast, [{ text: "a" }], { isDone: true }),
      ) as Active;
      expect(PaginatedQuery.next(last)).toEqual(Option.none());

      const cold = initial();
      const failed = PaginatedQuery.settle(
        cold,
        failure(cold, offline()),
      ) as Active;
      expect(PaginatedQuery.next(failed)).toEqual(Option.none());
      expect(PaginatedQuery.prev(failed)).toEqual(Option.none());
    });

    it("retreats when a terminal page becomes empty", () => {
      const loadingTwo = Option.getOrThrow(
        PaginatedQuery.next(loadedPageOne()),
      );
      const state = PaginatedQuery.settle(
        loadingTwo,
        success(loadingTwo, [], { isDone: true }),
      ) as Active;

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

    it("pins a recommended split and shows the delivered page", () => {
      const before = loadedPageOne();
      const state = PaginatedQuery.settle(
        before,
        success(before, bigPage, {
          splitCursor: "s",
          pageStatus: "SplitRecommended",
        }),
      ) as Active;

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
      ) as Active;

      expect(getPhase(state, "Refreshing").data.items).toEqual([
        { text: "a" },
        { text: "b" },
      ]);
    });

    it("uses the page-size heuristic and starts after a pin at its cursor", () => {
      const before = loadedPageOne();
      const split = PaginatedQuery.settle(
        before,
        success(before, bigPage, { splitCursor: "s" }),
      ) as Active;
      const pinned = PaginatedQuery.settle(
        split,
        success(split, [{ text: "a" }], { continueCursor: "server-cursor" }),
      ) as Active;
      const next = Option.getOrThrow(PaginatedQuery.next(pinned));

      expect(split.current).toEqual(descriptor(null, "s"));
      expect(next.current).toEqual(descriptor("s"));

      const unsplit = PaginatedQuery.settle(
        before,
        success(before, bigPage, { pageStatus: "SplitRequired" }),
      );
      expect(PaginatedQuery.isSuccess(unsplit)).toBe(true);
    });
  });

  describe("reset, matching, and schemas", () => {
    it("reset is pure and retains data while allocating a new session later", () => {
      const page = loadedPageOne();
      const state = PaginatedQuery.reset(page);

      expect(state.generation).toBe(page.generation + 1);
      expect(state.paginationId).toEqual(Option.none());
      expect(state.current).toEqual(descriptor(null));
      expect(getPhase(state, "Refreshing").direction).toBe("Reset");
    });

    it("matches all six states exhaustively", () => {
      const handlers = {
        onIdle: (state: PaginatedQuery.Idle) => state._tag,
        onLoading: (phase: PaginatedQuery.Loading) => phase._tag,
        onRefreshing: (phase: PaginatedQuery.Refreshing<Item>) => phase._tag,
        onFailure: (phase: PaginatedQuery.Failure<PageError>) => phase._tag,
        onStale: (phase: PaginatedQuery.Stale<Item, PageError>) => phase._tag,
        onSuccess: (phase: PaginatedQuery.Success<Item>) => phase._tag,
      };
      const loading = initial();
      const succeeded = loadedPageOne();
      const refreshing = Option.getOrThrow(PaginatedQuery.next(succeeded));
      const failed = PaginatedQuery.settle(
        loading,
        failure(loading, offline()),
      );
      const stale = PaginatedQuery.settle(
        succeeded,
        failure(succeeded, offline()),
      );

      expect(PaginatedQuery.match(Notes.idle, handlers)).toBe("Idle");
      expect(PaginatedQuery.match(loading, handlers)).toBe("Loading");
      expect(PaginatedQuery.match(refreshing, handlers)).toBe("Refreshing");
      expect(PaginatedQuery.match(failed, handlers)).toBe("Failure");
      expect(PaginatedQuery.match(stale, handlers)).toBe("Stale");
      expect(PaginatedQuery.match(succeeded, handlers)).toBe("Success");
    });

    it("exposes state predicates as refinements", () => {
      const state: State = loadedPageOne();
      const successful = [state].find(PaginatedQuery.isSuccess)!;
      expectTypeOf(successful.phase.data).toEqualTypeOf<
        PaginatedQuery.Page<Item>
      >();
      expect(PaginatedQuery.isIdle(Notes.idle)).toBe(true);
      expect(PaginatedQuery.isLoading(initial())).toBe(true);
      expect(PaginatedQuery.isSuccess(state)).toBe(true);
      expect(PaginatedQuery.isRefreshing(state)).toBe(false);
    });

    it("round-trips idle, active states, and settlements", () => {
      const loading = initial();
      const succeeded = loadedPageOne();
      const refreshing = Option.getOrThrow(PaginatedQuery.next(succeeded));
      const stale = PaginatedQuery.settle(
        refreshing,
        failure(refreshing, offline()),
      );

      for (const state of [Notes.idle, loading, succeeded, refreshing, stale]) {
        const encoded = Schema.encodeSync(Notes.schema)(state);
        expect(Schema.decodeUnknownSync(Notes.schema)(encoded)).toEqual(state);
      }

      for (const settlement of [
        success(loading, [{ text: "a" }]),
        failure(loading, offline()),
      ]) {
        const encoded = Schema.encodeSync(Notes.settlement)(settlement);
        expect(Schema.decodeUnknownSync(Notes.settlement)(encoded)).toEqual(
          settlement,
        );
      }
    });

    it("round-trips framework failures through the model's JSON codec", () => {
      const jsonCodec = Schema.toCodecJson(Notes.schema);
      const loading = initial();
      const networkFailure = PaginatedQuery.settle(
        loading,
        failure(
          loading,
          new Client.WebSocketClientError({ cause: new Error("offline") }),
        ),
      );
      const schemaResult = Schema.decodeUnknownResult(Schema.Finite)("bad");
      if (Result.isSuccess(schemaResult)) {
        throw new Error("expected schema decoding to fail");
      }
      const refreshing = Option.getOrThrow(
        PaginatedQuery.next(loadedPageOne()),
      );
      const schemaFailure = PaginatedQuery.settle(
        refreshing,
        failure(refreshing, schemaResult.failure),
      );

      const decodedNetworkFailure = Schema.decodeSync(jsonCodec)(
        Schema.encodeSync(jsonCodec)(networkFailure),
      );
      const decodedSchemaFailure = Schema.decodeSync(jsonCodec)(
        Schema.encodeSync(jsonCodec)(schemaFailure),
      );

      expect(PaginatedQuery.isFailure(decodedNetworkFailure)).toBe(true);
      if (PaginatedQuery.isFailure(decodedNetworkFailure)) {
        const error = decodedNetworkFailure.phase.error;
        if (!(error instanceof Client.WebSocketClientError)) {
          throw new Error("expected a WebSocketClientError");
        }
        expect(error.cause).toBeInstanceOf(Error);
        if (!(error.cause instanceof Error)) {
          throw new Error("expected an Error cause");
        }
        expect(error.cause.message).toBe("offline");
      }
      expect(PaginatedQuery.isStale(decodedSchemaFailure)).toBe(true);
      if (PaginatedQuery.isStale(decodedSchemaFailure)) {
        expect(Schema.isSchemaError(decodedSchemaFailure.phase.error)).toBe(
          true,
        );
        expect(String(decodedSchemaFailure.phase.error)).toBe(
          String(schemaResult.failure),
        );
      }
    });

    it("infers args, state, and helpers", () => {
      expectTypeOf(Notes.init).parameters.toEqualTypeOf<
        [PaginatedQuery.Idle, Args, PaginatedQuery.Options]
      >();
      expectTypeOf(Notes.init).returns.toEqualTypeOf<Active>();
      expectTypeOf(Notes.schema.Type).toEqualTypeOf<State>();
      expectTypeOf(PaginatedQuery.getItems(loadedPageOne())).toEqualTypeOf<
        Option.Option<ReadonlyArray<Item>>
      >();
    });

    it("includes the formal invalid-cursor settlement error", () => {
      const error: PageError = new PaginatedQuery.InvalidCursor({
        cause: "expired",
      });
      expect(error).toBeInstanceOf(PaginationError.InvalidCursor);
    });
  });
});
