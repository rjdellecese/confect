import { FunctionSpec, PaginationError, Ref } from "@confect/core";
import { describe, expect, layer } from "@effect/vitest";
import type { RegisteredQuery } from "convex/server";
import { ConvexError } from "convex/values";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { m } from "foldkit/message";
import * as FoldkitSubscription from "foldkit/subscription";
import { beforeEach } from "vitest";
import * as Client from "@confect/foldkit/Client";
import * as PaginatedQuery from "@confect/foldkit/PaginatedQuery";
import * as Subscription from "@confect/foldkit/Subscription";

interface Call {
  readonly name: string;
  readonly args: unknown;
}

let reactiveQueryCalls: Array<Call> = [];
let reactiveQueryResults: Stream.Stream<Result.Result<unknown, unknown>> =
  Stream.empty;

beforeEach(() => {
  reactiveQueryCalls = [];
  reactiveQueryResults = Stream.empty;
});

const StubLayer = Layer.effect(
  Client.Client,
  Client.make({
    url: "https://test.convex.cloud",
    setAuth: () => Effect.void,
    query: () => Effect.succeed({}),
    mutation: () => Effect.succeed({}),
    action: () => Effect.succeed({}),
    reactiveQuery: () => Stream.empty,
    reactiveQueryResult: (ref: Ref.Any, ...rest: [unknown?]) =>
      Stream.suspend(() => {
        reactiveQueryCalls.push({
          name: Ref.getConvexFunctionName(ref),
          args: rest[0] ?? {},
        });
        return reactiveQueryResults;
      }),
  } as any),
);

const getQueryRef = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "get",
    args: () => ({ id: Schema.String }),
    returns: () => Schema.Struct({ text: Schema.String }),
  }),
);

const listQueryRef = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "list",
    returns: () => Schema.Struct({}),
  }),
);

const convexGetQueryRef = Ref.make(
  "notes",
  FunctionSpec.convexPublicQuery<
    RegisteredQuery<"public", { id: string }, { text: string }>
  >()("get"),
);

interface Model {
  readonly noteId: Option.Option<string>;
}

const SucceededGetNote = m("SucceededGetNote", { note: Schema.Unknown });
const FailedGetNote = m("FailedGetNote", { error: Schema.Unknown });
type Message = typeof SucceededGetNote.Type | typeof FailedGetNote.Type;

const noteHandlers = {
  onSuccess: (note: unknown) => SucceededGetNote({ note }),
  onError: (error: unknown) => FailedGetNote({ error }),
};

const makeNoteEntry = () =>
  Subscription.reactiveQuery<Model>()(getQueryRef, {
    args: (model) => Option.map(model.noteId, (id) => ({ id })),
    onSuccess: (note) => SucceededGetNote({ note }),
    onError: (error) => FailedGetNote({ error }),
  });

layer(StubLayer)("Subscription", (it) => {
  describe("reactiveQuery", () => {
    it("extracts Option-wrapped args and defaults no-args queries open", () => {
      const entry = makeNoteEntry();
      const noArgs = Subscription.reactiveQuery<Model>()(
        listQueryRef,
        noteHandlers,
      );

      expect(entry.modelToDependencies({ noteId: Option.some("abc") })).toEqual(
        { args: Option.some({ id: "abc" }) },
      );
      expect(entry.modelToDependencies({ noteId: Option.none() })).toEqual({
        args: Option.none(),
      });
      expect(noArgs.modelToDependencies({ noteId: Option.none() })).toEqual({
        args: Option.some({}),
      });
    });

    it.effect("None dependencies produce an empty stream", () =>
      Effect.gen(function* () {
        const messages = yield* Stream.runCollect(
          makeNoteEntry().dependenciesToStream({ args: Option.none() }),
        );

        expect(messages).toEqual([]);
        expect(reactiveQueryCalls).toEqual([]);
      }),
    );

    it.effect(
      "maps successes and failures without ending the subscription",
      () =>
        Effect.gen(function* () {
          const error = new Client.WebSocketClientError({ cause: "bad query" });
          reactiveQueryResults = Stream.make(
            Result.succeed({ text: "a" }),
            Result.fail(error),
            Result.succeed({ text: "b" }),
          );

          const messages = yield* Stream.runCollect(
            makeNoteEntry().dependenciesToStream({
              args: Option.some({ id: "abc" }),
            }),
          );

          expect(messages).toEqual([
            SucceededGetNote({ note: { text: "a" } }),
            FailedGetNote({ error }),
            SucceededGetNote({ note: { text: "b" } }),
          ]);
          expect(reactiveQueryCalls).toEqual([
            { name: "notes:get", args: { id: "abc" } },
          ]);
        }),
    );

    it("derives dependency equivalence from the ref args schema", () => {
      const equivalence = Schema.toEquivalence(
        makeNoteEntry().dependenciesSchema,
      );

      expect(
        equivalence(
          { args: Option.some({ id: "a" }) },
          { args: Option.some({ id: "a" }) },
        ),
      ).toBe(true);
      expect(
        equivalence(
          { args: Option.some({ id: "a" }) },
          { args: Option.some({ id: "b" }) },
        ),
      ).toBe(false);
      expect(
        equivalence({ args: Option.none() }, { args: Option.none() }),
      ).toBe(true);
    });

    it("rejects Convex-provenance refs at the type level", () => {
      const makeConvexEntry = () =>
        // @ts-expect-error — only Confect-provenance refs are supported
        Subscription.reactiveQuery<Model>()(convexGetQueryRef, noteHandlers);

      expect(typeof makeConvexEntry).toBe("function");
    });

    it("requires args and is accepted by Foldkit Subscription.make", () => {
      const requiresArgs = () =>
        // @ts-expect-error — declared args require an extractor
        Subscription.reactiveQuery<Model>()(getQueryRef, noteHandlers);
      const subscriptions = FoldkitSubscription.make<
        Model,
        Message,
        Client.Client
      >()(() => ({ note: makeNoteEntry() }));

      expect(typeof requiresArgs).toBe("function");
      expect(typeof subscriptions.note.dependenciesToStream).toBe("function");
    });
  });

  describe("reactiveQueryStream", () => {
    it.effect("maps a sequence of results and forwards args", () =>
      Effect.gen(function* () {
        reactiveQueryResults = Stream.make(Result.succeed({ text: "raw" }));

        const messages = yield* Stream.runCollect(
          Subscription.reactiveQueryStream(
            getQueryRef,
            noteHandlers,
          )({ id: "abc" }),
        );

        expect(messages).toEqual([SucceededGetNote({ note: { text: "raw" } })]);
        expect(reactiveQueryCalls).toEqual([
          { name: "notes:get", args: { id: "abc" } },
        ]);
      }),
    );

    it("rejects Convex-provenance refs at the type level", () => {
      const makeConvexStream = () =>
        // @ts-expect-error — only Confect-provenance refs are supported
        Subscription.reactiveQueryStream(convexGetQueryRef, noteHandlers);

      expect(typeof makeConvexStream).toBe("function");
    });
  });
});

const Note = Schema.Struct({ text: Schema.String });

class PageDenied extends Schema.TaggedError<PageDenied>()("PageDenied", {
  reason: Schema.String,
}) {}

const paginateRef = Ref.make(
  "notes",
  FunctionSpec.publicPaginatedQuery({
    name: "paginate",
    args: () => ({ channel: Schema.String }),
    item: () => Note,
    error: () => PageDenied,
  }),
);

const Notes = PaginatedQuery.make(paginateRef);
type PaginatedState = typeof Notes.schema.Type;
type PaginatedActive = PaginatedQuery.Active<
  PaginatedQuery.Item<typeof paginateRef>,
  PaginatedQuery.UserArgs<typeof paginateRef>,
  PaginatedQuery.Error<typeof paginateRef>
>;

interface PaginatedModel {
  readonly notes: PaginatedState;
}

const SettledGetNotesPage = m("SettledGetNotesPage", {
  settlement: Notes.settlement,
});

const makePaginatedEntry = () =>
  Subscription.paginatedQuery<PaginatedModel>()(Notes, {
    state: (model) => model.notes,
    onSettled: (settlement) => SettledGetNotesPage({ settlement }),
  });

const initialMachine = (): PaginatedActive =>
  Notes.init(
    Notes.idle,
    { channel: "general" },
    {
      initialNumItems: 2,
      maximumRowsRead: 100,
      maximumBytesRead: 1_000,
    },
  );

const allocatedRequest = (
  state: PaginatedActive,
  paginationId = Option.getOrElse(state.paginationId, () => 1),
) =>
  PaginatedQuery.allocateRequest(
    PaginatedQuery.getSubscriptionRequest(state),
    paginationId,
  );

const settlePage = (
  state: PaginatedActive,
  overrides: Partial<PaginatedQuery.PageResult<{ readonly text: string }>> = {},
): PaginatedActive =>
  PaginatedQuery.settle(state, {
    request: allocatedRequest(state),
    result: Result.succeed({
      page: [{ text: "a" }],
      isDone: false,
      continueCursor: "c1",
      ...overrides,
    }),
  }) as PaginatedActive;

const failPage = (
  state: PaginatedActive,
  error: PaginatedQuery.Error<
    typeof paginateRef
  > = new Client.WebSocketClientError({ cause: "offline" }),
): PaginatedActive =>
  PaginatedQuery.settle(state, {
    request: allocatedRequest(state),
    result: Result.fail(error),
  }) as PaginatedActive;

const streamFor = (
  entry: ReturnType<typeof makePaginatedEntry>,
  request: PaginatedQuery.SubscriptionRequest<
    PaginatedQuery.UserArgs<typeof paginateRef>
  >,
) =>
  entry.dependenciesToStream({ request: Option.some(request) }, () => ({
    request: Option.some(request),
  }));

layer(StubLayer)("Subscription.paginatedQuery", (it) => {
  describe("modelToDependencies", () => {
    it("opens Active and closes Idle machines", () => {
      const entry = makePaginatedEntry();
      const state = initialMachine();

      expect(entry.modelToDependencies({ notes: state })).toEqual({
        request: Option.some(PaginatedQuery.getSubscriptionRequest(state)),
      });
      expect(entry.modelToDependencies({ notes: Notes.idle })).toEqual({
        request: Option.none(),
      });
    });

    it("keeps subscriptions open through Failure and Stale", () => {
      const entry = makePaginatedEntry();
      const failed = failPage(initialMachine());
      const stale = failPage(settlePage(initialMachine()));

      expect(entry.modelToDependencies({ notes: failed }).request).toEqual(
        Option.some(PaginatedQuery.getSubscriptionRequest(failed)),
      );
      expect(entry.modelToDependencies({ notes: stale }).request).toEqual(
        Option.some(PaginatedQuery.getSubscriptionRequest(stale)),
      );
    });
  });

  describe("dependenciesToStream", () => {
    it.effect("allocates an id and emits the first correlated settlement", () =>
      Effect.gen(function* () {
        reactiveQueryResults = Stream.make(
          Result.succeed({
            page: [{ text: "a" }],
            isDone: false,
            continueCursor: "c1",
          }),
        );
        const entry = makePaginatedEntry();
        const state = initialMachine();
        const subscriptionRequest =
          PaginatedQuery.getSubscriptionRequest(state);

        const messages = yield* Stream.runCollect(
          streamFor(entry, subscriptionRequest),
        );

        expect(messages).toHaveLength(1);
        const message = messages[0]!;
        const paginationId = message.settlement.request.paginationId;
        expect(message.settlement.result).toEqual(
          Result.succeed({
            page: [{ text: "a" }],
            isDone: false,
            continueCursor: "c1",
          }),
        );
        expect(reactiveQueryCalls).toEqual([
          {
            name: "notes:paginate",
            args: {
              channel: "general",
              paginationOpts: {
                numItems: 2,
                cursor: null,
                id: paginationId,
                maximumRowsRead: 100,
                maximumBytesRead: 1_000,
              },
            },
          },
        ]);
      }),
    );

    it.effect("reuses an installed id and passes a pinned end cursor", () =>
      Effect.gen(function* () {
        reactiveQueryResults = Stream.make(
          Result.succeed({ page: [], isDone: false, continueCursor: "s" }),
        );
        const entry = makePaginatedEntry();
        const logicalRequest = {
          ...PaginatedQuery.getSubscriptionRequest(initialMachine()),
          paginationId: Option.some(42),
          descriptor: { cursor: null, endCursor: Option.some("s") },
        };

        const messages = yield* Stream.runCollect(
          streamFor(entry, logicalRequest),
        );

        expect(messages[0]!.settlement.request.paginationId).toBe(42);
        expect(reactiveQueryCalls[0]!.args).toEqual({
          channel: "general",
          paginationOpts: {
            numItems: 2,
            cursor: null,
            endCursor: "s",
            id: 42,
            maximumRowsRead: 100,
            maximumBytesRead: 1_000,
          },
        });
      }),
    );

    it.effect("emits a failure and a later success from one live stream", () =>
      Effect.gen(function* () {
        const error = new PageDenied({ reason: "temporarily private" });
        reactiveQueryResults = Stream.make(
          Result.fail(error),
          Result.succeed({
            page: [{ text: "now visible" }],
            isDone: true,
            continueCursor: "",
          }),
        );
        const entry = makePaginatedEntry();

        const messages = yield* Stream.runCollect(
          streamFor(
            entry,
            PaginatedQuery.getSubscriptionRequest(initialMachine()),
          ),
        );

        expect(messages).toHaveLength(2);
        expect(messages[0]!.settlement.result).toEqual(
          Result.fail(PaginatedQuery.FunctionError({ error })),
        );
        expect(messages[1]!.settlement.result).toEqual(
          Result.succeed({
            page: [{ text: "now visible" }],
            isDone: true,
            continueCursor: "",
          }),
        );
        expect(reactiveQueryCalls).toHaveLength(1);
      }),
    );

    it.effect(
      "normalizes invalid cursors and carries codec errors directly",
      () =>
        Effect.gen(function* () {
          const cause = new ConvexError({
            isConvexSystemError: true,
            paginationError: "InvalidCursor",
          });
          const decoded = Schema.decodeUnknownResult(Schema.Finite)("bad");
          if (Result.isSuccess(decoded)) {
            throw new Error("expected schema decoding to fail");
          }
          reactiveQueryResults = Stream.make(
            Result.fail(new Client.WebSocketClientError({ cause })),
            Result.fail(decoded.failure),
          );
          const entry = makePaginatedEntry();

          const messages = yield* Stream.runCollect(
            streamFor(
              entry,
              PaginatedQuery.getSubscriptionRequest(initialMachine()),
            ),
          );

          expect(messages[0]!.settlement.result).toEqual(
            Result.fail(new PaginationError.InvalidCursor({ cause })),
          );
          expect(messages[1]!.settlement.result).toEqual(
            Result.fail(decoded.failure),
          );
        }),
    );

    it.effect("None dependencies produce an empty stream", () =>
      Effect.gen(function* () {
        const entry = makePaginatedEntry();
        const messages = yield* Stream.runCollect(
          entry.dependenciesToStream({ request: Option.none() }, () => ({
            request: Option.none(),
          })),
        );

        expect(messages).toEqual([]);
        expect(reactiveQueryCalls).toEqual([]);
      }),
    );
  });

  describe("keep-alive equivalence", () => {
    it("ignores only pagination-id installation", () => {
      const entry = makePaginatedEntry();
      const base = PaginatedQuery.getSubscriptionRequest(initialMachine());
      const deps = (request: typeof base) => ({
        request: Option.some(request),
      });

      expect(
        entry.keepAliveEquivalence(
          deps(base),
          deps({ ...base, paginationId: Option.some(42) }),
        ),
      ).toBe(true);
      expect(
        entry.keepAliveEquivalence(
          deps(base),
          deps({ ...base, generation: base.generation + 1 }),
        ),
      ).toBe(false);
      expect(
        entry.keepAliveEquivalence(
          deps(base),
          deps({ ...base, requestId: base.requestId + 1 }),
        ),
      ).toBe(false);
      expect(
        entry.keepAliveEquivalence(
          deps(base),
          deps({ ...base, args: { channel: "random" } }),
        ),
      ).toBe(false);
      expect(
        entry.keepAliveEquivalence(deps(base), { request: Option.none() }),
      ).toBe(false);
    });
  });

  describe("construction", () => {
    it("derives a settlement schema for every canonical error", () => {
      const state = initialMachine();
      const schemaResult = Schema.decodeUnknownResult(Schema.Finite)("bad");
      if (Result.isSuccess(schemaResult)) {
        throw new Error("expected schema decoding to fail");
      }
      const errors: ReadonlyArray<PaginatedQuery.Error<typeof paginateRef>> = [
        PaginatedQuery.FunctionError({
          error: new PageDenied({ reason: "private" }),
        }),
        new PaginationError.InvalidCursor({ cause: "expired" }),
        new Client.WebSocketClientError({ cause: "offline" }),
        schemaResult.failure,
      ];

      for (const error of errors) {
        const settlement = {
          request: allocatedRequest(state),
          result: Result.fail(error),
        };
        const encoded = Schema.encodeSync(Notes.settlement)(settlement);
        expect(Schema.decodeUnknownSync(Notes.settlement)(encoded)).toEqual(
          settlement,
        );
      }
    });

    it("requires a bundle and is accepted by Foldkit Subscription.make", () => {
      const invalid = () =>
        // @ts-expect-error — the bundle owns state and settlement schemas
        Subscription.paginatedQuery<PaginatedModel>()(paginateRef, {
          state: (model: PaginatedModel) => model.notes,
          onSettled: SettledGetNotesPage,
        });
      const subscriptions = FoldkitSubscription.make<
        PaginatedModel,
        typeof SettledGetNotesPage.Type,
        Client.Client
      >()(() => ({ notesPage: makePaginatedEntry() }));

      expect(typeof invalid).toBe("function");
      expect(typeof subscriptions.notesPage.dependenciesToStream).toBe(
        "function",
      );
    });
  });
});
