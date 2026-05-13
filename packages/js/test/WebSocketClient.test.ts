import { FunctionSpec, Ref } from "@confect/core";
import { describe, expect, it } from "@effect/vitest";
import { ConvexError } from "convex/values";
import {
  Chunk,
  Context,
  Effect,
  Either,
  Layer,
  Ref as MutableRef,
  Schema,
  Stream,
} from "effect";
import { beforeEach, vi } from "vitest";
import * as WebSocketClient from "../src/WebSocketClient";

const mockQuery = vi.fn().mockResolvedValue({});
const mockMutation = vi.fn().mockResolvedValue({});
const mockAction = vi.fn().mockResolvedValue({});

type OnUpdate = (result: unknown) => void;
type OnError = (error: unknown) => void;

const subscribers: Array<{ onUpdate: OnUpdate; onError: OnError }> = [];

beforeEach(() => {
  mockQuery.mockReset().mockResolvedValue({});
  mockMutation.mockReset().mockResolvedValue({});
  mockAction.mockReset().mockResolvedValue({});
  subscribers.length = 0;
});

vi.mock("convex/browser", () => ({
  ConvexClient: class {
    setAuth() {}
    close = vi.fn().mockResolvedValue(undefined);
    query = mockQuery;
    mutation = mockMutation;
    action = mockAction;
    onUpdate(
      _ref: unknown,
      _args: unknown,
      onUpdate: OnUpdate,
      onError: OnError,
    ) {
      subscribers.push({ onUpdate, onError });
      return () => {};
    }
  },
}));

const noArgsQueryRef = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "list",
    args: Schema.Struct({}),
    returns: Schema.Struct({}),
  }),
);

const argsQueryRef = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "get",
    args: Schema.Struct({ id: Schema.String }),
    returns: Schema.Struct({}),
  }),
);

const noArgsMutationRef = Ref.make(
  "tasks",
  FunctionSpec.publicMutation({
    name: "cleanup",
    args: Schema.Struct({}),
    returns: Schema.Struct({}),
  }),
);

const argsMutationRef = Ref.make(
  "notes",
  FunctionSpec.publicMutation({
    name: "insert",
    args: Schema.Struct({ text: Schema.String }),
    returns: Schema.Struct({}),
  }),
);

const noArgsActionRef = Ref.make(
  "random",
  FunctionSpec.publicAction({
    name: "getNumber",
    args: Schema.Struct({}),
    returns: Schema.Struct({}),
  }),
);

const argsActionRef = Ref.make(
  "email",
  FunctionSpec.publicAction({
    name: "send",
    args: Schema.Struct({ to: Schema.String }),
    returns: Schema.Struct({}),
  }),
);

interface Call {
  readonly name: string;
  readonly args: unknown;
}

const WebSocketClientSpy = Context.GenericTag<{
  readonly queryCalls: MutableRef.Ref<ReadonlyArray<Call>>;
  readonly mutationCalls: MutableRef.Ref<ReadonlyArray<Call>>;
  readonly actionCalls: MutableRef.Ref<ReadonlyArray<Call>>;
  readonly reactiveQueryCalls: MutableRef.Ref<ReadonlyArray<Call>>;
  readonly reactiveQueryFinalizations: MutableRef.Ref<ReadonlyArray<string>>;
}>("@test/WebSocketClientSpy");

const SpyLayer = Layer.effect(
  WebSocketClientSpy,
  Effect.gen(function* () {
    return {
      queryCalls: yield* MutableRef.make<ReadonlyArray<Call>>([]),
      mutationCalls: yield* MutableRef.make<ReadonlyArray<Call>>([]),
      actionCalls: yield* MutableRef.make<ReadonlyArray<Call>>([]),
      reactiveQueryCalls: yield* MutableRef.make<ReadonlyArray<Call>>([]),
      reactiveQueryFinalizations: yield* MutableRef.make<ReadonlyArray<string>>(
        [],
      ),
    };
  }),
);

const TestWebSocketClientLayer = Layer.effect(
  WebSocketClient.WebSocketClient,
  Effect.gen(function* () {
    const spy = yield* WebSocketClientSpy;

    const recordCall = (
      calls: MutableRef.Ref<ReadonlyArray<Call>>,
      funcRef: Ref.Any,
      rest: [unknown?],
    ) =>
      MutableRef.update(calls, (prev) => [
        ...prev,
        { name: Ref.getConvexFunctionName(funcRef), args: rest[0] ?? {} },
      ]);

    return {
      url: "https://test.convex.cloud",
      setAuth: () => Effect.void,

      query: (funcRef: Ref.Any, ...rest: [unknown?]) =>
        recordCall(spy.queryCalls, funcRef, rest).pipe(Effect.as({})),

      mutation: (funcRef: Ref.Any, ...rest: [unknown?]) =>
        recordCall(spy.mutationCalls, funcRef, rest).pipe(Effect.as({})),

      action: (funcRef: Ref.Any, ...rest: [unknown?]) =>
        recordCall(spy.actionCalls, funcRef, rest).pipe(Effect.as({})),

      reactiveQuery: (funcRef: Ref.Any, ...rest: [unknown?]) => {
        const name = Ref.getConvexFunctionName(funcRef);
        return Stream.fromEffect(
          recordCall(spy.reactiveQueryCalls, funcRef, rest).pipe(Effect.as({})),
        ).pipe(
          Stream.ensuring(
            MutableRef.update(spy.reactiveQueryFinalizations, (prev) => [
              ...prev,
              name,
            ]),
          ),
        );
      },
    } as any;
  }),
);

const TestLayer = Layer.merge(
  SpyLayer,
  TestWebSocketClientLayer.pipe(Layer.provide(SpyLayer)),
);

describe("WebSocketClient", () => {
  describe("query", () => {
    it.effect("args omitted when empty", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const spy = yield* WebSocketClientSpy;
        yield* client.query(noArgsQueryRef);
        expect(yield* MutableRef.get(spy.queryCalls)).toEqual([
          { name: "notes:list", args: {} },
        ]);
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("args passed when provided", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const spy = yield* WebSocketClientSpy;
        yield* client.query(argsQueryRef, { id: "abc" });
        expect(yield* MutableRef.get(spy.queryCalls)).toEqual([
          { name: "notes:get", args: { id: "abc" } },
        ]);
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("mutation", () => {
    it.effect("args omitted when empty", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const spy = yield* WebSocketClientSpy;
        yield* client.mutation(noArgsMutationRef);
        expect(yield* MutableRef.get(spy.mutationCalls)).toEqual([
          { name: "tasks:cleanup", args: {} },
        ]);
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("args passed when provided", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const spy = yield* WebSocketClientSpy;
        yield* client.mutation(argsMutationRef, { text: "hello" });
        expect(yield* MutableRef.get(spy.mutationCalls)).toEqual([
          { name: "notes:insert", args: { text: "hello" } },
        ]);
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("action", () => {
    it.effect("args omitted when empty", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const spy = yield* WebSocketClientSpy;
        yield* client.action(noArgsActionRef);
        expect(yield* MutableRef.get(spy.actionCalls)).toEqual([
          { name: "random:getNumber", args: {} },
        ]);
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("args passed when provided", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const spy = yield* WebSocketClientSpy;
        yield* client.action(argsActionRef, { to: "user@example.com" });
        expect(yield* MutableRef.get(spy.actionCalls)).toEqual([
          { name: "email:send", args: { to: "user@example.com" } },
        ]);
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("reactiveQuery", () => {
    it.effect("subscribes and emits values", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const result = yield* client
          .reactiveQuery(noArgsQueryRef)
          .pipe(Stream.take(1), Stream.runCollect);

        expect(Chunk.toReadonlyArray(result)).toEqual([{}]);
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("passes args", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const spy = yield* WebSocketClientSpy;
        yield* client
          .reactiveQuery(argsQueryRef, { id: "abc" })
          .pipe(Stream.take(1), Stream.runCollect);

        expect(yield* MutableRef.get(spy.reactiveQueryCalls)).toEqual([
          { name: "notes:get", args: { id: "abc" } },
        ]);
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("runs finalizer when stream is consumed", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const spy = yield* WebSocketClientSpy;
        yield* client
          .reactiveQuery(noArgsQueryRef)
          .pipe(Stream.take(1), Stream.runCollect);

        expect(yield* MutableRef.get(spy.reactiveQueryFinalizations)).toEqual([
          "notes:list",
        ]);
      }).pipe(Effect.provide(TestLayer)),
    );
  });
});

class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  id: Schema.String,
}) {}

const queryWithError = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "getOrFail",
    args: Schema.Struct({ id: Schema.String }),
    returns: Schema.Struct({ text: Schema.String }),
    error: NotFound,
  }),
);

const mutationWithError = Ref.make(
  "notes",
  FunctionSpec.publicMutation({
    name: "deleteOrFail",
    args: Schema.Struct({ id: Schema.String }),
    returns: Schema.Null,
    error: NotFound,
  }),
);

const actionWithError = Ref.make(
  "tasks",
  FunctionSpec.publicAction({
    name: "runOrFail",
    args: Schema.Struct({ id: Schema.String }),
    returns: Schema.Null,
    error: NotFound,
  }),
);

const realLayer = WebSocketClient.layer("https://test.convex.cloud");

describe("WebSocketClient error decoding", () => {
  describe("query", () => {
    it.scoped("decodes a matching ConvexError into the typed error", () =>
      Effect.gen(function* () {
        mockQuery.mockRejectedValue(
          new ConvexError({ _tag: "NotFound", id: "abc" }),
        );
        const client = yield* WebSocketClient.WebSocketClient;

        const result = yield* Effect.either(
          client.query(queryWithError, { id: "abc" }),
        );
        expect(Either.isLeft(result)).toBe(true);
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(NotFound);
          expect((result.left as NotFound).id).toBe("abc");
        }
      }).pipe(Effect.provide(realLayer)),
    );

    it.scoped("wraps a non-ConvexError as WebSocketClientError", () =>
      Effect.gen(function* () {
        mockQuery.mockRejectedValue(new Error("network down"));
        const client = yield* WebSocketClient.WebSocketClient;

        const result = yield* Effect.either(
          client.query(queryWithError, { id: "abc" }),
        );
        expect(Either.isLeft(result)).toBe(true);
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(
            WebSocketClient.WebSocketClientError,
          );
        }
      }).pipe(Effect.provide(realLayer)),
    );
  });

  describe("mutation", () => {
    it.scoped("decodes a matching ConvexError into the typed error", () =>
      Effect.gen(function* () {
        mockMutation.mockRejectedValue(
          new ConvexError({ _tag: "NotFound", id: "abc" }),
        );
        const client = yield* WebSocketClient.WebSocketClient;

        const result = yield* Effect.either(
          client.mutation(mutationWithError, { id: "abc" }),
        );
        expect(Either.isLeft(result)).toBe(true);
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(NotFound);
        }
      }).pipe(Effect.provide(realLayer)),
    );
  });

  describe("action", () => {
    it.scoped("decodes a matching ConvexError into the typed error", () =>
      Effect.gen(function* () {
        mockAction.mockRejectedValue(
          new ConvexError({ _tag: "NotFound", id: "abc" }),
        );
        const client = yield* WebSocketClient.WebSocketClient;

        const result = yield* Effect.either(
          client.action(actionWithError, { id: "abc" }),
        );
        expect(Either.isLeft(result)).toBe(true);
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(NotFound);
        }
      }).pipe(Effect.provide(realLayer)),
    );
  });

  describe("reactiveQuery", () => {
    it.scoped("emits the typed error when a matching ConvexError fires", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const fiber = yield* Effect.fork(
          Effect.either(
            client
              .reactiveQuery(queryWithError, { id: "abc" })
              .pipe(Stream.take(1), Stream.runCollect),
          ),
        );

        // Wait for the subscription to register before firing.
        yield* Effect.async<void>((resume) => {
          const tick = () => {
            if (subscribers.length > 0) {
              resume(Effect.void);
            } else {
              setTimeout(tick, 1);
            }
          };
          tick();
        });

        subscribers[0]!.onError(
          new ConvexError({ _tag: "NotFound", id: "abc" }),
        );

        const result = yield* fiber;
        expect(Either.isLeft(result)).toBe(true);
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(NotFound);
          expect((result.left as NotFound).id).toBe("abc");
        }
      }).pipe(Effect.provide(realLayer)),
    );

    it.scoped("emits a WebSocketClientError when a non-ConvexError fires", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const fiber = yield* Effect.fork(
          Effect.either(
            client
              .reactiveQuery(queryWithError, { id: "abc" })
              .pipe(Stream.take(1), Stream.runCollect),
          ),
        );

        yield* Effect.async<void>((resume) => {
          const tick = () => {
            if (subscribers.length > 0) {
              resume(Effect.void);
            } else {
              setTimeout(tick, 1);
            }
          };
          tick();
        });

        subscribers[0]!.onError(new Error("network down"));

        const result = yield* fiber;
        expect(Either.isLeft(result)).toBe(true);
        if (Either.isLeft(result)) {
          expect(result.left).toBeInstanceOf(
            WebSocketClient.WebSocketClientError,
          );
        }
      }).pipe(Effect.provide(realLayer)),
    );
  });
});
