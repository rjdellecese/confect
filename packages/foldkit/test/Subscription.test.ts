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
  Subscription.reactiveQuery(getQueryRef, {
    args: (model: Model) => Option.map(model.noteId, (id) => ({ id })),
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
      const entry = Subscription.reactiveQuery(listQueryRef, noteHandlers);

      expect(entry.modelToDependencies({})).toEqual({
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

    it("rejects Convex-provenance refs at construction time", () => {
      expect(() =>
        Subscription.reactiveQuery(convexGetQueryRef, {
          args: (model: Model) => Option.map(model.noteId, (id) => ({ id })),
          onSuccess: (note) => GotNote({ note }),
          onError: (error) => FailedGetNote({ error }),
        }),
      ).toThrow(/was not built with `FunctionSpec.publicQuery`/);
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
        Subscription.reactiveQuery(getQueryRef, noteHandlers);

      expect(typeof requiresArgs).toBe("function");
    });
  });

  describe("reactiveQueryStream", () => {
    it.effect("works with Convex-provenance refs", () =>
      Effect.gen(function* () {
        reactiveQueryResults = Stream.make({ text: "raw" });

        const messages = yield* Stream.runCollect(
          Subscription.reactiveQueryStream(
            convexGetQueryRef,
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
  });
});
