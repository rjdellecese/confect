import { FunctionSpec, Ref } from "@confect/core";
import { describe, expect, layer } from "@effect/vitest";
import type { RegisteredQuery } from "convex/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { m } from "foldkit/message";
import * as FoldkitSubscription from "foldkit/subscription";
import { beforeEach } from "vitest";
import * as PaginatedQuery from "@confect/foldkit/PaginatedQuery";
import * as Subscription from "@confect/foldkit/Subscription";
import * as WebSocketClient from "@confect/foldkit/WebSocketClient";

interface Call {
  readonly name: string;
  readonly args: unknown;
}

let reactiveQueryCalls: Array<Call> = [];
let reactiveQueryResults: Stream.Stream<unknown, unknown> = Stream.empty;

beforeEach(() => {
  reactiveQueryCalls = [];
  reactiveQueryResults = Stream.empty;
});

const StubLayer = Layer.sync(
  WebSocketClient.WebSocketClient,
  () =>
    ({
      url: "https://test.convex.cloud",
      setAuth: () => Effect.void,
      query: () => Effect.succeed({}),
      mutation: () => Effect.succeed({}),
      action: () => Effect.succeed({}),
      reactiveQuery: (ref: Ref.Any, ...rest: [unknown?]) =>
        Stream.suspend(() => {
          reactiveQueryCalls.push({
            name: Ref.getConvexFunctionName(ref),
            args: rest[0] ?? {},
          });
          return reactiveQueryResults;
        }),
    }) as any,
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
    args: () => ({}),
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
    it("extracts the Option-wrapped args from the Model", () => {
      const entry = makeNoteEntry();

      expect(entry.modelToDependencies({ noteId: Option.some("abc") })).toEqual(
        { args: Option.some({ id: "abc" }) },
      );
      expect(entry.modelToDependencies({ noteId: Option.none() })).toEqual({
        args: Option.none(),
      });
    });

    it("defaults to an always-open subscription when args is omitted", () => {
      const entry = Subscription.reactiveQuery<Model>()(
        listQueryRef,
        noteHandlers,
      );

      expect(entry.modelToDependencies({ noteId: Option.none() })).toEqual({
        args: Option.some({}),
      });
    });

    it.effect("None dependencies produce an empty stream", () =>
      Effect.gen(function* () {
        const entry = makeNoteEntry();

        const messages = yield* Stream.runCollect(
          entry.dependenciesToStream({ args: Option.none() }),
        );

        expect(messages).toEqual([]);
        expect(reactiveQueryCalls).toEqual([]);
      }),
    );

    it.effect(
      "Some dependencies subscribe with the args and map emissions",
      () =>
        Effect.gen(function* () {
          reactiveQueryResults = Stream.make({ text: "a" }, { text: "b" });
          const entry = makeNoteEntry();

          const messages = yield* Stream.runCollect(
            entry.dependenciesToStream({ args: Option.some({ id: "abc" }) }),
          );

          expect(messages).toEqual([
            SucceededGetNote({ note: { text: "a" } }),
            SucceededGetNote({ note: { text: "b" } }),
          ]);
          expect(reactiveQueryCalls).toEqual([
            { name: "notes:get", args: { id: "abc" } },
          ]);
        }),
    );

    it.effect("a stream error emits one onError Message and ends", () =>
      Effect.gen(function* () {
        const error = new WebSocketClient.WebSocketClientError({
          cause: "connection lost",
        });
        reactiveQueryResults = Stream.concat(
          Stream.succeed({ text: "a" }),
          Stream.fail(error),
        );
        const entry = makeNoteEntry();

        const messages = yield* Stream.runCollect(
          entry.dependenciesToStream({ args: Option.some({ id: "abc" }) }),
        );

        expect(messages).toEqual([
          SucceededGetNote({ note: { text: "a" } }),
          FailedGetNote({ error }),
        ]);
      }),
    );

    it("derives dependency equivalence from the ref's args schema", () => {
      const entry = makeNoteEntry();
      const equivalence = Schema.toEquivalence(entry.dependenciesSchema);

      // Freshly allocated but structurally equal dependencies must compare
      // equal — this is what keeps the Foldkit runtime from tearing the
      // subscription down on every Model update.
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
        equivalence(
          { args: Option.some({ id: "a" }) },
          { args: Option.none() },
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

    it("is accepted by Foldkit's Subscription.make", () => {
      const subscriptions = FoldkitSubscription.make<
        Model,
        Message,
        WebSocketClient.WebSocketClient
      >()(() => ({
        note: makeNoteEntry(),
      }));

      expect(typeof subscriptions.note.dependenciesToStream).toBe("function");
      expect(typeof subscriptions.note.modelToDependencies).toBe("function");
    });

    it("requires the args extractor when the query declares args", () => {
      const requiresArgs = () =>
        // @ts-expect-error — `args` is required for a query that declares args
        Subscription.reactiveQuery<Model>()(getQueryRef, noteHandlers);

      expect(typeof requiresArgs).toBe("function");
    });
  });

  describe("reactiveQueryStream", () => {
    it.effect("maps emissions to Messages and forwards args", () =>
      Effect.gen(function* () {
        reactiveQueryResults = Stream.make({ text: "raw" });

        const messages = yield* Stream.runCollect(
          Subscription.reactiveQueryStream(
            getQueryRef,
            noteHandlers,
          )({
            id: "abc",
          }),
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

const paginateRef = Ref.make(
  "notes",
  FunctionSpec.publicPaginatedQuery({
    name: "paginate",
    args: () => ({ channel: Schema.String }),
    item: () => Note,
  }),
);

const NotesMachine = PaginatedQuery.make(paginateRef, Schema.String);

interface PaginatedModel {
  readonly notes: Option.Option<typeof NotesMachine.schema.Type>;
}

const SettledGetNotesPage = m("SettledGetNotesPage", {
  settlement: NotesMachine.settlement,
});

const makePaginatedEntry = () =>
  Subscription.paginatedQuery<PaginatedModel>()(NotesMachine, {
    state: (model) => model.notes,
    mapError: String,
    onSettled: (settlement) => SettledGetNotesPage({ settlement }),
  });

const initialMachine = () =>
  NotesMachine.init(
    { channel: "general" },
    {
      initialNumItems: 2,
      maximumRowsRead: 100,
      maximumBytesRead: 1_000,
    },
  );

const settlePage = (
  state: typeof NotesMachine.schema.Type,
  overrides: Partial<PaginatedQuery.PageResult<{ readonly text: string }>> = {},
) =>
  PaginatedQuery.settle(state, {
    request: PaginatedQuery.getRequest(state),
    result: Result.succeed({
      page: [{ text: "a" }],
      isDone: false,
      continueCursor: "c1",
      ...overrides,
    }),
  });

const failPage = (state: typeof NotesMachine.schema.Type, error = "offline") =>
  PaginatedQuery.settle(state, {
    request: PaginatedQuery.getRequest(state),
    result: Result.fail(error),
  });

layer(StubLayer)("Subscription.paginatedQuery", (it) => {
  describe("modelToDependencies", () => {
    it("derives a correlated request from the machine state", () => {
      const entry = makePaginatedEntry();
      const state = initialMachine();

      expect(entry.modelToDependencies({ notes: Option.some(state) })).toEqual({
        request: Option.some(PaginatedQuery.getRequest(state)),
      });
      expect(entry.modelToDependencies({ notes: Option.none() })).toEqual({
        request: Option.none(),
      });
    });

    it("tracks a split-pinned descriptor", () => {
      const entry = makePaginatedEntry();
      const before = initialMachine();
      const pinned = settlePage(before, {
        page: [
          { text: "a" },
          { text: "b" },
          { text: "c" },
          { text: "d" },
          { text: "e" },
        ],
        isDone: false,
        continueCursor: "c1",
        splitCursor: "s",
        pageStatus: "SplitRecommended",
      });

      expect(entry.modelToDependencies({ notes: Option.some(pinned) })).toEqual(
        {
          request: Option.some(PaginatedQuery.getRequest(pinned)),
        },
      );
    });

    it("closes the subscription for both error-bearing states", () => {
      const entry = makePaginatedEntry();
      const cold = initialMachine();
      const failed = failPage(cold);
      expect(entry.modelToDependencies({ notes: Option.some(failed) })).toEqual(
        {
          request: Option.none(),
        },
      );

      const loaded = settlePage(initialMachine());
      const stale = failPage(loaded);
      expect(entry.modelToDependencies({ notes: Option.some(stale) })).toEqual({
        request: Option.none(),
      });
    });
  });

  describe("dependenciesToStream", () => {
    it.effect(
      "passes all pagination options and emits a successful Result",
      () =>
        Effect.gen(function* () {
          reactiveQueryResults = Stream.make({
            page: [{ text: "a" }],
            isDone: false,
            continueCursor: "c1",
          });
          const entry = makePaginatedEntry();
          const state = initialMachine();
          const request = PaginatedQuery.getRequest(state);

          const messages = yield* Stream.runCollect(
            entry.dependenciesToStream({
              request: Option.some(request),
            }),
          );

          expect(messages).toEqual([
            SettledGetNotesPage({
              settlement: {
                request,
                result: Result.succeed({
                  page: [{ text: "a" }],
                  isDone: false,
                  continueCursor: "c1",
                }),
              },
            }),
          ]);
          expect(reactiveQueryCalls).toEqual([
            {
              name: "notes:paginate",
              args: {
                channel: "general",
                paginationOpts: {
                  numItems: 2,
                  cursor: null,
                  id: state.paginationId,
                  maximumRowsRead: 100,
                  maximumBytesRead: 1_000,
                },
              },
            },
          ]);
        }),
    );

    it.effect("passes endCursor only for a pinned request", () =>
      Effect.gen(function* () {
        reactiveQueryResults = Stream.make({
          page: [],
          isDone: false,
          continueCursor: "s",
        });
        const entry = makePaginatedEntry();
        const state = initialMachine();
        const request = {
          ...PaginatedQuery.getRequest(state),
          descriptor: {
            cursor: null,
            endCursor: Option.some("s"),
          },
        };

        yield* Stream.runCollect(
          entry.dependenciesToStream({
            request: Option.some(request),
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
                endCursor: "s",
                id: state.paginationId,
                maximumRowsRead: 100,
                maximumBytesRead: 1_000,
              },
            },
          },
        ]);
      }),
    );

    it.effect("omits optional read limits when they are not configured", () =>
      Effect.gen(function* () {
        reactiveQueryResults = Stream.make({
          page: [],
          isDone: true,
          continueCursor: "",
        });
        const entry = makePaginatedEntry();
        const state = NotesMachine.init(
          { channel: "general" },
          { initialNumItems: 2 },
        );

        yield* Stream.runCollect(
          entry.dependenciesToStream({
            request: Option.some(PaginatedQuery.getRequest(state)),
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
                id: state.paginationId,
              },
            },
          },
        ]);
      }),
    );

    it.effect("maps an error into the same correlated settlement shape", () =>
      Effect.gen(function* () {
        const error = new WebSocketClient.WebSocketClientError({
          cause: "connection lost",
        });
        reactiveQueryResults = Stream.fail(error);
        const entry = makePaginatedEntry();
        const state = initialMachine();
        const request = PaginatedQuery.getRequest(state);

        const messages = yield* Stream.runCollect(
          entry.dependenciesToStream({
            request: Option.some(request),
          }),
        );

        expect(messages).toEqual([
          SettledGetNotesPage({
            settlement: {
              request,
              result: Result.fail(String(error)),
            },
          }),
        ]);
      }),
    );

    it.effect("None dependencies produce an empty stream", () =>
      Effect.gen(function* () {
        const entry = makePaginatedEntry();

        const messages = yield* Stream.runCollect(
          entry.dependenciesToStream({ request: Option.none() }),
        );

        expect(messages).toEqual([]);
        expect(reactiveQueryCalls).toEqual([]);
      }),
    );
  });

  describe("dependency equivalence", () => {
    it("discriminates every part of the request identity", () => {
      const entry = makePaginatedEntry();
      const equivalence = Schema.toEquivalence(entry.dependenciesSchema);
      const base = PaginatedQuery.getRequest(initialMachine());
      const deps = (request: typeof base) => ({
        request: Option.some(request),
      });

      expect(equivalence(deps(base), deps(base))).toBe(true);
      expect(
        equivalence(
          deps(base),
          deps({ ...base, descriptor: { ...base.descriptor, cursor: "c2" } }),
        ),
      ).toBe(false);
      expect(
        equivalence(deps(base), deps({ ...base, args: { channel: "random" } })),
      ).toBe(false);
      expect(
        equivalence(
          deps(base),
          deps({ ...base, options: { ...base.options, initialNumItems: 3 } }),
        ),
      ).toBe(false);
      expect(
        equivalence(
          deps(base),
          deps({ ...base, paginationId: base.paginationId + 1 }),
        ),
      ).toBe(false);
      expect(
        equivalence(
          deps(base),
          deps({ ...base, requestId: base.requestId + 1 }),
        ),
      ).toBe(false);
    });
  });

  describe("construction", () => {
    it("requires a PaginatedQuery bundle rather than a bare ref", () => {
      const invalid = () =>
        // @ts-expect-error — the bundle owns the state and settlement schemas
        Subscription.paginatedQuery<PaginatedModel>()(paginateRef, {
          state: (model: PaginatedModel) => model.notes,
          mapError: String,
          onSettled: SettledGetNotesPage,
        });

      expect(typeof invalid).toBe("function");
    });

    it("is accepted by Foldkit's Subscription.make", () => {
      const subscriptions = FoldkitSubscription.make<
        PaginatedModel,
        typeof SettledGetNotesPage.Type,
        WebSocketClient.WebSocketClient
      >()(() => ({
        notesPage: makePaginatedEntry(),
      }));

      expect(typeof subscriptions.notesPage.dependenciesToStream).toBe(
        "function",
      );
    });
  });
});
