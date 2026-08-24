import { FunctionSpec, Ref } from "@confect/core";
import { describe, expect, layer } from "@effect/vitest";
import type { RegisteredQuery } from "convex/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
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
    args: () => Schema.Struct({ id: Schema.String }),
    returns: () => Schema.Struct({ text: Schema.String }),
  }),
);

const listQueryRef = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "list",
    args: () => Schema.Struct({}),
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

const GotNote = m("GotNote", { note: Schema.Unknown });
const FailedGetNote = m("FailedGetNote", { error: Schema.Unknown });
type Message = typeof GotNote.Type | typeof FailedGetNote.Type;

const noteHandlers = {
  onSuccess: (note: unknown) => GotNote({ note }),
  onError: (error: unknown) => FailedGetNote({ error }),
};

const makeNoteEntry = () =>
  Subscription.reactiveQuery<Model>()(getQueryRef, {
    args: (model) => Option.map(model.noteId, (id) => ({ id })),
    onSuccess: (note) => GotNote({ note }),
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
            GotNote({ note: { text: "a" } }),
            GotNote({ note: { text: "b" } }),
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
          GotNote({ note: { text: "a" } }),
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

        expect(messages).toEqual([GotNote({ note: { text: "raw" } })]);
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
    args: () => Schema.Struct({ channel: Schema.String }),
    item: () => Note,
  }),
);

const NotesMachine = PaginatedQuery.make(paginateRef);

interface PaginatedModel {
  readonly notes: Option.Option<
    PaginatedQuery.State<
      { readonly text: string },
      { readonly channel: string }
    >
  >;
}

const SettledNotesPage = m("SettledNotesPage", { result: Schema.Unknown });
const FailedNotesPage = m("FailedNotesPage", { error: Schema.Unknown });

const makePaginatedEntry = () =>
  Subscription.paginatedQuery<PaginatedModel>()(paginateRef, {
    state: (model) => model.notes,
    onResult: (result) => SettledNotesPage({ result }),
    onError: (error) => FailedNotesPage({ error }),
  });

const initialMachine = () =>
  NotesMachine.init({ channel: "general" }, { numItems: 2 });

layer(StubLayer)("Subscription.paginatedQuery", (it) => {
  describe("modelToDependencies", () => {
    it("derives composed args from the machine state", () => {
      const entry = makePaginatedEntry();

      expect(
        entry.modelToDependencies({ notes: Option.some(initialMachine()) }),
      ).toEqual({
        args: Option.some({
          channel: "general",
          paginationOpts: { numItems: 2, cursor: null },
        }),
      });
      expect(entry.modelToDependencies({ notes: Option.none() })).toEqual({
        args: Option.none(),
      });
    });

    it("includes endCursor only when the page is pinned", () => {
      const entry = makePaginatedEntry();
      const pinned = PaginatedQuery.settle(initialMachine(), {
        descriptor: { cursor: null, endCursor: Option.none() },
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
          args: Option.some({
            channel: "general",
            paginationOpts: { numItems: 2, cursor: null, endCursor: "s" },
          }),
        },
      );
    });

    it("closes the subscription when the machine has failed", () => {
      const entry = makePaginatedEntry();
      const failed = PaginatedQuery.fail(initialMachine());

      expect(entry.modelToDependencies({ notes: Option.some(failed) })).toEqual(
        { args: Option.none() },
      );
    });
  });

  describe("dependenciesToStream", () => {
    it.effect("subscribes with the composed args and wraps results", () =>
      Effect.gen(function* () {
        reactiveQueryResults = Stream.make({
          page: [{ text: "a" }],
          isDone: false,
          continueCursor: "c1",
        });
        const entry = makePaginatedEntry();

        const messages = yield* Stream.runCollect(
          entry.dependenciesToStream({
            args: Option.some({
              channel: "general",
              paginationOpts: { numItems: 2, cursor: null },
            }),
          }),
        );

        expect(messages).toEqual([
          SettledNotesPage({
            result: {
              descriptor: { cursor: null, endCursor: Option.none() },
              page: [{ text: "a" }],
              isDone: false,
              continueCursor: "c1",
            },
          }),
        ]);
        expect(reactiveQueryCalls).toEqual([
          {
            name: "notes:paginate",
            args: {
              channel: "general",
              paginationOpts: { numItems: 2, cursor: null },
            },
          },
        ]);
      }),
    );

    it.effect("derives the pinned descriptor from the deps", () =>
      Effect.gen(function* () {
        reactiveQueryResults = Stream.make({
          page: [],
          isDone: false,
          continueCursor: "s",
        });
        const entry = makePaginatedEntry();

        const messages = yield* Stream.runCollect(
          entry.dependenciesToStream({
            args: Option.some({
              channel: "general",
              paginationOpts: { numItems: 2, cursor: null, endCursor: "s" },
            }),
          }),
        );

        expect(messages).toEqual([
          SettledNotesPage({
            result: {
              descriptor: { cursor: null, endCursor: Option.some("s") },
              page: [],
              isDone: false,
              continueCursor: "s",
            },
          }),
        ]);
      }),
    );

    it.effect("a stream error emits one onError Message and ends", () =>
      Effect.gen(function* () {
        const error = new WebSocketClient.WebSocketClientError({
          cause: "connection lost",
        });
        reactiveQueryResults = Stream.fail(error);
        const entry = makePaginatedEntry();

        const messages = yield* Stream.runCollect(
          entry.dependenciesToStream({
            args: Option.some({
              channel: "general",
              paginationOpts: { numItems: 2, cursor: null },
            }),
          }),
        );

        expect(messages).toEqual([FailedNotesPage({ error })]);
      }),
    );

    it.effect("None dependencies produce an empty stream", () =>
      Effect.gen(function* () {
        const entry = makePaginatedEntry();

        const messages = yield* Stream.runCollect(
          entry.dependenciesToStream({ args: Option.none() }),
        );

        expect(messages).toEqual([]);
        expect(reactiveQueryCalls).toEqual([]);
      }),
    );
  });

  describe("dependency equivalence", () => {
    it("discriminates on cursor, endCursor presence, user args, and numItems", () => {
      const entry = makePaginatedEntry();
      const equivalence = Schema.toEquivalence(entry.dependenciesSchema);
      const deps = (
        paginationOpts: {
          numItems: number;
          cursor: string | null;
          endCursor?: string;
        },
        channel = "general",
      ) => ({
        args: Option.some({ channel, paginationOpts }),
      });

      expect(
        equivalence(
          deps({ numItems: 2, cursor: "c1" }),
          deps({ numItems: 2, cursor: "c1" }),
        ),
      ).toBe(true);
      expect(
        equivalence(
          deps({ numItems: 2, cursor: "c1" }),
          deps({ numItems: 2, cursor: "c2" }),
        ),
      ).toBe(false);
      expect(
        equivalence(
          deps({ numItems: 2, cursor: "c1" }),
          deps({ numItems: 2, cursor: "c1", endCursor: "s" }),
        ),
      ).toBe(false);
      expect(
        equivalence(
          deps({ numItems: 2, cursor: "c1" }),
          deps({ numItems: 2, cursor: "c1" }, "random"),
        ),
      ).toBe(false);
      expect(
        equivalence(
          deps({ numItems: 2, cursor: "c1" }),
          deps({ numItems: 3, cursor: "c1" }),
        ),
      ).toBe(false);
    });
  });

  describe("construction", () => {
    it("rejects refs without paginated provenance", () => {
      expect(() =>
        Subscription.paginatedQuery<PaginatedModel>()(
          getQueryRef as unknown as Ref.AnyConfectPublicPaginatedQuery,
          {
            state: (model) => model.notes,
            onResult: (result) => SettledNotesPage({ result }),
            onError: (error) => FailedNotesPage({ error }),
          },
        ),
      ).toThrow(/FunctionSpec.publicPaginatedQuery/);
    });

    it("is accepted by Foldkit's Subscription.make", () => {
      const subscriptions = FoldkitSubscription.make<
        PaginatedModel,
        typeof SettledNotesPage.Type | typeof FailedNotesPage.Type,
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
