import { FunctionSpec, Ref } from "@confect/core";
import { assert, describe, expect, expectTypeOf, it } from "@effect/vitest";
import { getFunctionName, type FunctionType } from "convex/server";
import { ConvexError } from "convex/values";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as EffectRef from "effect/Ref";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as WebSocketClient from "@confect/js/WebSocketClient";
import * as InternalWebSocketClient from "../src/internal/WebSocketClient";

type Operation = FunctionType | "reactiveQuery";
type RequestOperation = FunctionType;

interface Call {
  readonly name: string;
  readonly args: unknown;
}

interface TestSubscription {
  readonly emit: (value: unknown) => Effect.Effect<void>;
  readonly fail: (error: Error) => Effect.Effect<void>;
}

interface TestTransport extends InternalWebSocketClient.Transport {
  readonly calls: (operation: Operation) => Effect.Effect<ReadonlyArray<Call>>;
  readonly failNext: (
    operation: RequestOperation,
    rejection: unknown,
  ) => Effect.Effect<void>;
  readonly nextSubscription: () => Effect.Effect<TestSubscription>;
  readonly closeCount: () => Effect.Effect<number>;
  readonly unsubscribeCount: () => Effect.Effect<number>;
}

// Keep inspection and synchronization operations function-valued.
// @effect-diagnostics-next-line lazyEffect:off
class TestWebSocketTransport extends Context.Service<
  TestWebSocketTransport,
  TestTransport
>()("@confect/js/test/WebSocketClient.test/TestWebSocketTransport") {}

const TestWebSocketClientLayer = Layer.effectContext(
  Effect.gen(function* () {
    const context = yield* Effect.context<never>();
    const runSync = Effect.runSyncWith(context);
    const runPromise = Effect.runPromiseWith(context);
    const calls = yield* EffectRef.make<
      Readonly<Record<Operation, ReadonlyArray<Call>>>
    >({ query: [], mutation: [], action: [], reactiveQuery: [] });
    const rejections = yield* EffectRef.make<
      Readonly<Record<RequestOperation, Option.Option<unknown>>>
    >({
      query: Option.none(),
      mutation: Option.none(),
      action: Option.none(),
    });
    const subscriptions = yield* Queue.unbounded<TestSubscription>();
    const closed = yield* EffectRef.make(0);
    const unsubscribed = yield* EffectRef.make(0);

    const recordCall = (
      operation: Operation,
      functionReference: Parameters<
        InternalWebSocketClient.Transport[RequestOperation | "onUpdate"]
      >[0],
      args: unknown,
    ) =>
      EffectRef.update(calls, (current) => ({
        ...current,
        [operation]: [
          ...current[operation],
          { name: getFunctionName(functionReference), args },
        ],
      }));

    const invokeEffect = Effect.fnUntraced(function* (
      operation: RequestOperation,
      functionReference: Parameters<
        InternalWebSocketClient.Transport[RequestOperation]
      >[0],
      args: unknown,
    ) {
      yield* recordCall(operation, functionReference, args);
      const rejection = yield* EffectRef.modify(rejections, (current) => [
        current[operation],
        { ...current, [operation]: Option.none() },
      ]);
      if (Option.isSome(rejection)) {
        throw rejection.value;
      }
      return {};
    });

    const invoke = (
      operation: RequestOperation,
      functionReference: Parameters<
        InternalWebSocketClient.Transport[RequestOperation]
      >[0],
      args: unknown,
    ): Promise<unknown> =>
      runPromise(invokeEffect(operation, functionReference, args));

    const service = TestWebSocketTransport.of({
      setAuth: () => {},
      close: () =>
        EffectRef.update(closed, (count) => count + 1).pipe(runPromise),
      query: (functionReference, args) =>
        invoke("query", functionReference, args),
      mutation: (functionReference, args) =>
        invoke("mutation", functionReference, args),
      action: (functionReference, args) =>
        invoke("action", functionReference, args),
      onUpdate: (functionReference, args, onUpdate, onError) => {
        runSync(recordCall("reactiveQuery", functionReference, args));
        Queue.offerUnsafe(subscriptions, {
          emit: (value) => Effect.sync(() => onUpdate(value)),
          fail: (error) => Effect.sync(() => onError(error)),
        });
        return () => {
          runSync(EffectRef.update(unsubscribed, (count) => count + 1));
        };
      },
      calls: Effect.fn("TestWebSocketTransport.calls")(function* (operation) {
        return (yield* EffectRef.get(calls))[operation];
      }),
      failNext: Effect.fn("TestWebSocketTransport.failNext")(
        function* (operation, rejection) {
          yield* EffectRef.update(rejections, (current) => ({
            ...current,
            [operation]: Option.some(rejection),
          }));
        },
      ),
      nextSubscription: Effect.fn("TestWebSocketTransport.nextSubscription")(
        function* () {
          return yield* Queue.take(subscriptions);
        },
      ),
      closeCount: Effect.fn("TestWebSocketTransport.closeCount")(function* () {
        return yield* EffectRef.get(closed);
      }),
      unsubscribeCount: Effect.fn("TestWebSocketTransport.unsubscribeCount")(
        function* () {
          return yield* EffectRef.get(unsubscribed);
        },
      ),
    });

    const client = yield* InternalWebSocketClient.makeScoped(
      "https://test.convex.cloud",
      Effect.succeed(service),
    );

    return Context.empty().pipe(
      Context.add(TestWebSocketTransport, service),
      Context.add(WebSocketClient.WebSocketClient, client),
    );
  }),
);

const noArgsQueryRef = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "list",
    returns: () => Schema.Struct({}),
  }),
);

const argsQueryRef = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "get",
    args: () => ({ id: Schema.String }),
    returns: () => Schema.Struct({}),
  }),
);

const noArgsMutationRef = Ref.make(
  "tasks",
  FunctionSpec.publicMutation({
    name: "cleanup",
    returns: () => Schema.Struct({}),
  }),
);

const argsMutationRef = Ref.make(
  "notes",
  FunctionSpec.publicMutation({
    name: "insert",
    args: () => ({ text: Schema.String }),
    returns: () => Schema.Struct({}),
  }),
);

const noArgsActionRef = Ref.make(
  "random",
  FunctionSpec.publicAction({
    name: "getNumber",
    returns: () => Schema.Struct({}),
  }),
);

const argsActionRef = Ref.make(
  "email",
  FunctionSpec.publicAction({
    name: "send",
    args: () => ({ to: Schema.String }),
    returns: () => Schema.Struct({}),
  }),
);

describe("WebSocketClient", () => {
  describe("query", () => {
    it.effect("uses empty args when omitted", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const transport = yield* TestWebSocketTransport;
        yield* client.query(noArgsQueryRef);
        expect(yield* transport.calls("query")).toEqual([
          { name: "notes:list", args: {} },
        ]);
      }).pipe(Effect.provide(TestWebSocketClientLayer)),
    );

    it.effect("passes provided args", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const transport = yield* TestWebSocketTransport;
        yield* client.query(argsQueryRef, { id: "abc" });
        expect(yield* transport.calls("query")).toEqual([
          { name: "notes:get", args: { id: "abc" } },
        ]);
      }).pipe(Effect.provide(TestWebSocketClientLayer)),
    );
  });

  describe("mutation", () => {
    it.effect("uses empty args when omitted", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const transport = yield* TestWebSocketTransport;
        yield* client.mutation(noArgsMutationRef);
        expect(yield* transport.calls("mutation")).toEqual([
          { name: "tasks:cleanup", args: {} },
        ]);
      }).pipe(Effect.provide(TestWebSocketClientLayer)),
    );

    it.effect("passes provided args", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const transport = yield* TestWebSocketTransport;
        yield* client.mutation(argsMutationRef, { text: "hello" });
        expect(yield* transport.calls("mutation")).toEqual([
          { name: "notes:insert", args: { text: "hello" } },
        ]);
      }).pipe(Effect.provide(TestWebSocketClientLayer)),
    );
  });

  describe("action", () => {
    it.effect("uses empty args when omitted", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const transport = yield* TestWebSocketTransport;
        yield* client.action(noArgsActionRef);
        expect(yield* transport.calls("action")).toEqual([
          { name: "random:getNumber", args: {} },
        ]);
      }).pipe(Effect.provide(TestWebSocketClientLayer)),
    );

    it.effect("passes provided args", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const transport = yield* TestWebSocketTransport;
        yield* client.action(argsActionRef, { to: "user@example.com" });
        expect(yield* transport.calls("action")).toEqual([
          { name: "email:send", args: { to: "user@example.com" } },
        ]);
      }).pipe(Effect.provide(TestWebSocketClientLayer)),
    );
  });

  describe("reactiveQuery", () => {
    it.effect("subscribes and emits values", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const transport = yield* TestWebSocketTransport;
        const fiber = yield* client
          .reactiveQuery(noArgsQueryRef)
          .pipe(Stream.take(1), Stream.runCollect, Effect.forkChild);

        const subscription = yield* transport.nextSubscription();
        yield* subscription.emit({});

        expect(yield* Fiber.join(fiber)).toEqual([{}]);
      }).pipe(Effect.provide(TestWebSocketClientLayer)),
    );

    it.effect("passes provided args", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const transport = yield* TestWebSocketTransport;
        const fiber = yield* client
          .reactiveQuery(argsQueryRef, { id: "abc" })
          .pipe(Stream.take(1), Stream.runCollect, Effect.forkChild);

        const subscription = yield* transport.nextSubscription();
        expect(yield* transport.calls("reactiveQuery")).toEqual([
          { name: "notes:get", args: { id: "abc" } },
        ]);
        yield* subscription.emit({});
        yield* Fiber.join(fiber);
      }).pipe(Effect.provide(TestWebSocketClientLayer)),
    );

    it.effect("unsubscribes when stream consumption ends", () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const transport = yield* TestWebSocketTransport;
        const fiber = yield* client
          .reactiveQuery(noArgsQueryRef)
          .pipe(Stream.take(1), Stream.runDrain, Effect.forkChild);

        const subscription = yield* transport.nextSubscription();
        yield* subscription.emit({});
        yield* Fiber.join(fiber);

        expect(yield* transport.unsubscribeCount()).toBe(1);
      }).pipe(Effect.provide(TestWebSocketClientLayer)),
    );
  });

  it.effect("closes the raw client when its layer is released", () =>
    Effect.gen(function* () {
      const transport = yield* TestWebSocketTransport.pipe(
        Effect.provide(TestWebSocketClientLayer),
      );
      expect(yield* transport.closeCount()).toBe(1);
    }),
  );
});

class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  id: Schema.String,
}) {}

const queryWithError = Ref.make(
  "notes",
  FunctionSpec.publicQuery({
    name: "getOrFail",
    args: () => ({ id: Schema.String }),
    returns: () => Schema.Struct({ text: Schema.String }),
    error: () => NotFound,
  }),
);

const mutationWithError = Ref.make(
  "notes",
  FunctionSpec.publicMutation({
    name: "deleteOrFail",
    args: () => ({ id: Schema.String }),
    returns: () => Schema.Null,
    error: () => NotFound,
  }),
);

const actionWithError = Ref.make(
  "tasks",
  FunctionSpec.publicAction({
    name: "runOrFail",
    args: () => ({ id: Schema.String }),
    returns: () => Schema.Null,
    error: () => NotFound,
  }),
);

describe("WebSocketClient error decoding", () => {
  it.effect(
    "preserves generic argument tuples, results, and error channels",
    () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        expectTypeOf(
          client.query<typeof noArgsQueryRef>,
        ).parameters.toEqualTypeOf<[ref: typeof noArgsQueryRef, args?: {}]>();
        expectTypeOf(
          client.query<typeof argsQueryRef>,
        ).parameters.toEqualTypeOf<
          [ref: typeof argsQueryRef, args: { readonly id: string }]
        >();
        expectTypeOf(
          client.mutation<typeof noArgsMutationRef>,
        ).parameters.toEqualTypeOf<
          [ref: typeof noArgsMutationRef, args?: {}]
        >();
        expectTypeOf(
          client.mutation<typeof argsMutationRef>,
        ).parameters.toEqualTypeOf<
          [ref: typeof argsMutationRef, args: { readonly text: string }]
        >();
        expectTypeOf(
          client.action<typeof argsActionRef>,
        ).parameters.toEqualTypeOf<
          [ref: typeof argsActionRef, args: { readonly to: string }]
        >();
        expectTypeOf(
          client.action<typeof noArgsActionRef>,
        ).parameters.toEqualTypeOf<[ref: typeof noArgsActionRef, args?: {}]>();
        expectTypeOf(client.query(queryWithError, { id: "abc" })).toEqualTypeOf<
          Effect.Effect<
            { readonly text: string },
            NotFound | WebSocketClient.WebSocketClientError | Schema.SchemaError
          >
        >();
        expectTypeOf(
          client.mutation(mutationWithError, { id: "abc" }),
        ).toEqualTypeOf<
          Effect.Effect<
            null,
            NotFound | WebSocketClient.WebSocketClientError | Schema.SchemaError
          >
        >();
        expectTypeOf(
          client.action(actionWithError, { id: "abc" }),
        ).toEqualTypeOf<
          Effect.Effect<
            null,
            NotFound | WebSocketClient.WebSocketClientError | Schema.SchemaError
          >
        >();
      }).pipe(Effect.provide(TestWebSocketClientLayer)),
  );

  it.effect("decodes a query ConvexError", () =>
    Effect.gen(function* () {
      const transport = yield* TestWebSocketTransport;
      yield* transport.failNext(
        "query",
        new ConvexError({ _tag: "NotFound", id: "abc" }),
      );
      const client = yield* WebSocketClient.WebSocketClient;

      const result = yield* Effect.result(
        client.query(queryWithError, { id: "abc" }),
      );
      assert(Result.isFailure(result));
      assert(Schema.is(NotFound)(result.failure));
      expect(result.failure.id).toBe("abc");
    }).pipe(Effect.provide(TestWebSocketClientLayer)),
  );

  it.effect("wraps an unknown query rejection", () =>
    Effect.gen(function* () {
      const transport = yield* TestWebSocketTransport;
      yield* transport.failNext("query", new Error("network down"));
      const client = yield* WebSocketClient.WebSocketClient;

      const result = yield* Effect.result(
        client.query(queryWithError, { id: "abc" }),
      );
      assert(Result.isFailure(result));
      expect(result.failure).toBeInstanceOf(
        WebSocketClient.WebSocketClientError,
      );
    }).pipe(Effect.provide(TestWebSocketClientLayer)),
  );

  it.effect("decodes a mutation ConvexError", () =>
    Effect.gen(function* () {
      const transport = yield* TestWebSocketTransport;
      yield* transport.failNext(
        "mutation",
        new ConvexError({ _tag: "NotFound", id: "abc" }),
      );
      const client = yield* WebSocketClient.WebSocketClient;

      const result = yield* Effect.result(
        client.mutation(mutationWithError, { id: "abc" }),
      );
      assert(Result.isFailure(result));
      expect(result.failure).toBeInstanceOf(NotFound);
    }).pipe(Effect.provide(TestWebSocketClientLayer)),
  );

  it.effect("decodes an action ConvexError", () =>
    Effect.gen(function* () {
      const transport = yield* TestWebSocketTransport;
      yield* transport.failNext(
        "action",
        new ConvexError({ _tag: "NotFound", id: "abc" }),
      );
      const client = yield* WebSocketClient.WebSocketClient;

      const result = yield* Effect.result(
        client.action(actionWithError, { id: "abc" }),
      );
      assert(Result.isFailure(result));
      expect(result.failure).toBeInstanceOf(NotFound);
    }).pipe(Effect.provide(TestWebSocketClientLayer)),
  );

  it.effect("emits a typed reactive-query error", () =>
    Effect.gen(function* () {
      const client = yield* WebSocketClient.WebSocketClient;
      const transport = yield* TestWebSocketTransport;
      const fiber = yield* client
        .reactiveQuery(queryWithError, { id: "abc" })
        .pipe(
          Stream.take(1),
          Stream.runCollect,
          Effect.result,
          Effect.forkChild,
        );

      const subscription = yield* transport.nextSubscription();
      yield* subscription.fail(
        new ConvexError({ _tag: "NotFound", id: "abc" }),
      );

      const result = yield* Fiber.join(fiber);
      assert(Result.isFailure(result));
      assert(Schema.is(NotFound)(result.failure));
      expect(result.failure.id).toBe("abc");
    }).pipe(Effect.provide(TestWebSocketClientLayer)),
  );

  it.effect("wraps an unknown reactive-query error", () =>
    Effect.gen(function* () {
      const client = yield* WebSocketClient.WebSocketClient;
      const transport = yield* TestWebSocketTransport;
      const fiber = yield* client
        .reactiveQuery(queryWithError, { id: "abc" })
        .pipe(
          Stream.take(1),
          Stream.runCollect,
          Effect.result,
          Effect.forkChild,
        );

      const subscription = yield* transport.nextSubscription();
      yield* subscription.fail(new Error("network down"));

      const result = yield* Fiber.join(fiber);
      assert(Result.isFailure(result));
      expect(result.failure).toBeInstanceOf(
        WebSocketClient.WebSocketClientError,
      );
    }).pipe(Effect.provide(TestWebSocketClientLayer)),
  );

  it.effect("keeps listening after a reactive-query error result", () =>
    Effect.gen(function* () {
      const client = yield* WebSocketClient.WebSocketClient;
      const transport = yield* TestWebSocketTransport;
      const fiber = yield* client
        .reactiveQueryResult(queryWithError, { id: "abc" })
        .pipe(Stream.take(2), Stream.runCollect, Effect.forkChild);

      const subscription = yield* transport.nextSubscription();
      yield* subscription.fail(
        new ConvexError({ _tag: "NotFound", id: "abc" }),
      );
      yield* subscription.emit({ text: "recovered" });

      const results = yield* Fiber.join(fiber);
      expect(results).toHaveLength(2);
      assert(Result.isFailure(results[0]));
      expect(results[0].failure).toBeInstanceOf(NotFound);
      expect(results[1]).toEqual(Result.succeed({ text: "recovered" }));
    }).pipe(Effect.provide(TestWebSocketClientLayer)),
  );
});
