import { FunctionSpec, Ref } from "@confect/core";
import { assert, describe, expect, layer } from "@effect/vitest";
import { ConvexError } from "convex/values";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Result from "effect/Result";
import * as Layer from "effect/Layer";
import * as MutableRef from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { beforeEach, vi } from "vitest";
import * as WebSocketClient from "@confect/js/WebSocketClient";

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
    args: () => Schema.Struct({}),
    returns: () => Schema.Struct({}),
  }),
);

const argsQueryRef = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "get",
    args: () => Schema.Struct({ id: Schema.String }),
    returns: () => Schema.Struct({}),
  }),
);

const noArgsMutationRef = Ref.make(
  "tasks",
  FunctionSpec.publicMutation({
    name: "cleanup",
    args: () => Schema.Struct({}),
    returns: () => Schema.Struct({}),
  }),
);

const argsMutationRef = Ref.make(
  "notes",
  FunctionSpec.publicMutation({
    name: "insert",
    args: () => Schema.Struct({ text: Schema.String }),
    returns: () => Schema.Struct({}),
  }),
);

const noArgsActionRef = Ref.make(
  "random",
  FunctionSpec.publicAction({
    name: "getNumber",
    args: () => Schema.Struct({}),
    returns: () => Schema.Struct({}),
  }),
);

const argsActionRef = Ref.make(
  "email",
  FunctionSpec.publicAction({
    name: "send",
    args: () => Schema.Struct({ to: Schema.String }),
    returns: () => Schema.Struct({}),
  }),
);

interface Call {
  readonly name: string;
  readonly args: unknown;
}

const WebSocketClientSpy = Context.Service<{
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

const clearSpy = Effect.gen(function* () {
  const spy = yield* WebSocketClientSpy;
  yield* MutableRef.set(spy.queryCalls, []);
  yield* MutableRef.set(spy.mutationCalls, []);
  yield* MutableRef.set(spy.actionCalls, []);
  yield* MutableRef.set(spy.reactiveQueryCalls, []);
  yield* MutableRef.set(spy.reactiveQueryFinalizations, []);
});

const withFreshSpy = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  clearSpy.pipe(Effect.andThen(() => effect));

layer(TestLayer)("WebSocketClient", (it) => {
  describe("query", () => {
    it.effect("args omitted when empty", () =>
      withFreshSpy(
        Effect.gen(function* () {
          const client = yield* WebSocketClient.WebSocketClient;
          const spy = yield* WebSocketClientSpy;
          yield* client.query(noArgsQueryRef);
          expect(yield* MutableRef.get(spy.queryCalls)).toEqual([
            { name: "notes:list", args: {} },
          ]);
        }),
      ),
    );

    it.effect("args passed when provided", () =>
      withFreshSpy(
        Effect.gen(function* () {
          const client = yield* WebSocketClient.WebSocketClient;
          const spy = yield* WebSocketClientSpy;
          yield* client.query(argsQueryRef, { id: "abc" });
          expect(yield* MutableRef.get(spy.queryCalls)).toEqual([
            { name: "notes:get", args: { id: "abc" } },
          ]);
        }),
      ),
    );
  });

  describe("mutation", () => {
    it.effect("args omitted when empty", () =>
      withFreshSpy(
        Effect.gen(function* () {
          const client = yield* WebSocketClient.WebSocketClient;
          const spy = yield* WebSocketClientSpy;
          yield* client.mutation(noArgsMutationRef);
          expect(yield* MutableRef.get(spy.mutationCalls)).toEqual([
            { name: "tasks:cleanup", args: {} },
          ]);
        }),
      ),
    );

    it.effect("args passed when provided", () =>
      withFreshSpy(
        Effect.gen(function* () {
          const client = yield* WebSocketClient.WebSocketClient;
          const spy = yield* WebSocketClientSpy;
          yield* client.mutation(argsMutationRef, { text: "hello" });
          expect(yield* MutableRef.get(spy.mutationCalls)).toEqual([
            { name: "notes:insert", args: { text: "hello" } },
          ]);
        }),
      ),
    );
  });

  describe("action", () => {
    it.effect("args omitted when empty", () =>
      withFreshSpy(
        Effect.gen(function* () {
          const client = yield* WebSocketClient.WebSocketClient;
          const spy = yield* WebSocketClientSpy;
          yield* client.action(noArgsActionRef);
          expect(yield* MutableRef.get(spy.actionCalls)).toEqual([
            { name: "random:getNumber", args: {} },
          ]);
        }),
      ),
    );

    it.effect("args passed when provided", () =>
      withFreshSpy(
        Effect.gen(function* () {
          const client = yield* WebSocketClient.WebSocketClient;
          const spy = yield* WebSocketClientSpy;
          yield* client.action(argsActionRef, { to: "user@example.com" });
          expect(yield* MutableRef.get(spy.actionCalls)).toEqual([
            { name: "email:send", args: { to: "user@example.com" } },
          ]);
        }),
      ),
    );
  });

  describe("reactiveQuery", () => {
    it.effect("subscribes and emits values", () =>
      withFreshSpy(
        Effect.gen(function* () {
          const client = yield* WebSocketClient.WebSocketClient;
          const result = yield* client
            .reactiveQuery(noArgsQueryRef)
            .pipe(Stream.take(1), Stream.runCollect);

          expect(result).toEqual([{}]);
        }),
      ),
    );

    it.effect("passes args", () =>
      withFreshSpy(
        Effect.gen(function* () {
          const client = yield* WebSocketClient.WebSocketClient;
          const spy = yield* WebSocketClientSpy;
          yield* client
            .reactiveQuery(argsQueryRef, { id: "abc" })
            .pipe(Stream.take(1), Stream.runCollect);

          expect(yield* MutableRef.get(spy.reactiveQueryCalls)).toEqual([
            { name: "notes:get", args: { id: "abc" } },
          ]);
        }),
      ),
    );

    it.effect("runs finalizer when stream is consumed", () =>
      withFreshSpy(
        Effect.gen(function* () {
          const client = yield* WebSocketClient.WebSocketClient;
          const spy = yield* WebSocketClientSpy;
          yield* client
            .reactiveQuery(noArgsQueryRef)
            .pipe(Stream.take(1), Stream.runCollect);

          expect(yield* MutableRef.get(spy.reactiveQueryFinalizations)).toEqual(
            ["notes:list"],
          );
        }),
      ),
    );
  });
});

class NotFound extends Schema.TaggedErrorClass<NotFound>()("NotFound", {
  id: Schema.String,
}) {}

const queryWithError = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "getOrFail",
    args: () => Schema.Struct({ id: Schema.String }),
    returns: () => Schema.Struct({ text: Schema.String }),
    error: () => NotFound,
  }),
);

const mutationWithError = Ref.make(
  "notes",
  FunctionSpec.publicMutation({
    name: "deleteOrFail",
    args: () => Schema.Struct({ id: Schema.String }),
    returns: () => Schema.Null,
    error: () => NotFound,
  }),
);

const actionWithError = Ref.make(
  "tasks",
  FunctionSpec.publicAction({
    name: "runOrFail",
    args: () => Schema.Struct({ id: Schema.String }),
    returns: () => Schema.Null,
    error: () => NotFound,
  }),
);

const RealLayer = WebSocketClient.layer("https://test.convex.cloud");

layer(RealLayer)("WebSocketClient error decoding", (it) => {
  describe("query", () => {
    it.effect("decodes a matching ConvexError into the typed error", () =>
      Effect.gen(function* () {
        mockQuery.mockRejectedValue(
          new ConvexError({ _tag: "NotFound", id: "abc" }),
        );
        const client = yield* WebSocketClient.WebSocketClient;

        const result = yield* Effect.result(
          client.query(queryWithError, { id: "abc" }),
        );
        assert(Result.isFailure(result));
        assert(result.failure instanceof NotFound);
        expect(result.failure.id).toBe("abc");
      }),
    );

    it.effect("wraps a non-ConvexError as WebSocketClientError", () =>
      Effect.gen(function* () {
        mockQuery.mockRejectedValue(new Error("network down"));
        const client = yield* WebSocketClient.WebSocketClient;

        const result = yield* Effect.result(
          client.query(queryWithError, { id: "abc" }),
        );
        assert(Result.isFailure(result));
        expect(result.failure).toBeInstanceOf(
          WebSocketClient.WebSocketClientError,
        );
      }),
    );
  });

  describe("mutation", () => {
    it.effect("decodes a matching ConvexError into the typed error", () =>
      Effect.gen(function* () {
        mockMutation.mockRejectedValue(
          new ConvexError({ _tag: "NotFound", id: "abc" }),
        );
        const client = yield* WebSocketClient.WebSocketClient;

        const result = yield* Effect.result(
          client.mutation(mutationWithError, { id: "abc" }),
        );
        assert(Result.isFailure(result));
        expect(result.failure).toBeInstanceOf(NotFound);
      }),
    );
  });

  describe("action", () => {
    it.effect("decodes a matching ConvexError into the typed error", () =>
      Effect.gen(function* () {
        mockAction.mockRejectedValue(
          new ConvexError({ _tag: "NotFound", id: "abc" }),
        );
        const client = yield* WebSocketClient.WebSocketClient;

        const result = yield* Effect.result(
          client.action(actionWithError, { id: "abc" }),
        );
        assert(Result.isFailure(result));
        expect(result.failure).toBeInstanceOf(NotFound);
      }),
    );
  });

  describe("reactiveQuery", () => {
    it.effect("emits the typed error when a matching ConvexError fires", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const fiber = yield* Effect.forkChild(
          Effect.result(
            client
              .reactiveQuery(queryWithError, { id: "abc" })
              .pipe(Stream.take(1), Stream.runCollect),
          ),
        );

        // Wait for the subscription to register before firing.
        yield* Effect.callback<void>((resume) => {
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

        const result = yield* Fiber.join(fiber);
        assert(Result.isFailure(result));
        assert(result.failure instanceof NotFound);
        expect(result.failure.id).toBe("abc");
      }),
    );

    it.effect("emits a WebSocketClientError when a non-ConvexError fires", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const fiber = yield* Effect.forkChild(
          Effect.result(
            client
              .reactiveQuery(queryWithError, { id: "abc" })
              .pipe(Stream.take(1), Stream.runCollect),
          ),
        );

        yield* Effect.callback<void>((resume) => {
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

        const result = yield* Fiber.join(fiber);
        assert(Result.isFailure(result));
        expect(result.failure).toBeInstanceOf(
          WebSocketClient.WebSocketClientError,
        );
      }),
    );
  });
});
