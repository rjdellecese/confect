import { FunctionSpec, Ref } from "@confect/core";
import { assert, describe, expect, expectTypeOf, it } from "@effect/vitest";
import { getFunctionName, type FunctionType } from "convex/server";
import { ConvexError } from "convex/values";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
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
type AuthRegistration = Parameters<
  InternalWebSocketClient.Transport["setAuth"]
>;

class TokenProvider extends Context.Service<
  TokenProvider,
  {
    readonly fetch: (
      forceRefresh: boolean,
    ) => Effect.Effect<string | null | undefined>;
  }
>()("@confect/js/test/WebSocketClient.test/TokenProvider") {}

class AuthObserver extends Context.Service<
  AuthObserver,
  {
    readonly notify: (authenticated: boolean) => Effect.Effect<void>;
  }
>()("@confect/js/test/WebSocketClient.test/AuthObserver") {}

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
    rejection: Error,
  ) => Effect.Effect<void>;
  readonly nextSubscription: () => Effect.Effect<TestSubscription>;
  readonly nextAuth: () => Effect.Effect<AuthRegistration>;
  readonly authCount: () => Effect.Effect<number>;
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
    const authRegistrations = yield* Queue.unbounded<AuthRegistration>();
    const authCount = yield* EffectRef.make(0);
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
    ) => runPromise(invokeEffect(operation, functionReference, args));

    const service = TestWebSocketTransport.of({
      setAuth: (...callbacks) => {
        runSync(EffectRef.update(authCount, (count) => count + 1));
        Queue.offerUnsafe(authRegistrations, callbacks);
      },
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
      nextAuth: () => Queue.take(authRegistrations),
      authCount: () => EffectRef.get(authCount),
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

describe("WebSocketClient authentication", () => {
  it.effect("captures callback dependencies lazily at registration time", () =>
    Effect.gen(function* () {
      const client = yield* WebSocketClient.WebSocketClient;
      const transport = yield* TestWebSocketTransport;
      const requests = yield* EffectRef.make<ReadonlyArray<boolean>>([]);
      const changes = yield* Queue.unbounded<boolean>();
      const releaseChange = yield* Deferred.make<void>();
      const register = client.setAuth(
        ({ forceRefreshToken }) =>
          Effect.flatMap(TokenProvider, (tokens) =>
            tokens.fetch(forceRefreshToken),
          ),
        (authenticated) =>
          Effect.flatMap(AuthObserver, (observer) =>
            observer.notify(authenticated),
          ),
      );
      expectTypeOf(register).toEqualTypeOf<
        Effect.Effect<void, never, TokenProvider | AuthObserver>
      >();
      expect(yield* transport.authCount()).toBe(0);

      yield* register.pipe(
        Effect.provideService(TokenProvider, {
          fetch: (forceRefresh) =>
            EffectRef.update(requests, (values) => [
              ...values,
              forceRefresh,
            ]).pipe(
              Effect.as(
                forceRefresh ? "refreshed-test-token" : "cached-test-token",
              ),
            ),
        }),
        Effect.provideService(AuthObserver, {
          notify: (authenticated) =>
            Deferred.await(releaseChange).pipe(
              Effect.andThen(Queue.offer(changes, authenticated)),
              Effect.asVoid,
            ),
        }),
      );

      expect(yield* transport.authCount()).toBe(1);
      expect(yield* EffectRef.get(requests)).toEqual([]);
      const [fetchToken, onChange] = yield* transport.nextAuth();
      assert.isDefined(onChange);
      expect(
        yield* Effect.promise(() => fetchToken({ forceRefreshToken: false })),
      ).toBe("cached-test-token");
      expect(
        yield* Effect.promise(() => fetchToken({ forceRefreshToken: true })),
      ).toBe("refreshed-test-token");
      expect(yield* EffectRef.get(requests)).toEqual([false, true]);

      expect(yield* Effect.sync(() => onChange(true))).toBeUndefined();
      yield* Deferred.succeed(releaseChange, undefined);
      expect(yield* Queue.take(changes)).toBe(true);
      yield* Effect.sync(() => onChange(false));
      expect(yield* Queue.take(changes)).toBe(false);
    }).pipe(Effect.provide(TestWebSocketClientLayer)),
  );

  it.effect("captures a fresh context each time registration executes", () =>
    Effect.gen(function* () {
      const client = yield* WebSocketClient.WebSocketClient;
      const transport = yield* TestWebSocketTransport;
      const register = client.setAuth(({ forceRefreshToken }) =>
        Effect.flatMap(TokenProvider, (tokens) =>
          tokens.fetch(forceRefreshToken),
        ),
      );
      expectTypeOf(register).toEqualTypeOf<
        Effect.Effect<void, never, TokenProvider>
      >();
      yield* register.pipe(
        Effect.provideService(TokenProvider, {
          fetch: () => Effect.succeed("first-test-token"),
        }),
      );
      yield* register.pipe(
        Effect.provideService(TokenProvider, {
          fetch: () => Effect.succeed("second-test-token"),
        }),
      );
      const first = yield* transport.nextAuth();
      const second = yield* transport.nextAuth();
      expect(first).toHaveLength(1);
      expect(second).toHaveLength(1);
      expect(
        yield* Effect.promise(() => second[0]({ forceRefreshToken: true })),
      ).toBe("second-test-token");
      expect(
        yield* Effect.promise(() => first[0]({ forceRefreshToken: true })),
      ).toBe("first-test-token");
    }).pipe(Effect.provide(TestWebSocketClientLayer)),
  );

  it.effect(
    "preserves unauthenticated tokens and dependency-free callbacks",
    () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const transport = yield* TestWebSocketTransport;
        const register = client.setAuth(({ forceRefreshToken }) =>
          Effect.succeed(forceRefreshToken ? undefined : null),
        );
        expectTypeOf(register).toEqualTypeOf<Effect.Effect<void>>();
        yield* register;
        const [fetchToken, onChange] = yield* transport.nextAuth();
        expect(onChange).toBeUndefined();
        expect(
          yield* Effect.promise(() => fetchToken({ forceRefreshToken: false })),
        ).toBeNull();
        expect(
          yield* Effect.promise(() => fetchToken({ forceRefreshToken: true })),
        ).toBeUndefined();
      }).pipe(Effect.provide(TestWebSocketClientLayer)),
  );

  it.effect(
    "keeps callback error channels empty and infers observer-only requirements",
    () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const register = client.setAuth(
          () => Effect.succeed(null),
          (authenticated) =>
            Effect.flatMap(AuthObserver, (observer) =>
              observer.notify(authenticated),
            ),
        );
        expectTypeOf(register).toEqualTypeOf<
          Effect.Effect<void, never, AuthObserver>
        >();
        expectTypeOf(
          client.setAuth(() => Effect.succeed(null), undefined),
        ).toEqualTypeOf<Effect.Effect<void>>();
        const check = () => {
          expectTypeOf(
            client.setAuth(
              // @ts-expect-error Token callbacks must handle typed failures before returning.
              () => Effect.fail("token failure"),
            ),
          );
          expectTypeOf(
            client.setAuth(
              () => Effect.succeed(null),
              // @ts-expect-error Observer callbacks must handle typed failures before returning.
              () => Effect.fail("observer failure"),
            ),
          );
        };
        expectTypeOf(check).toBeFunction();
      }).pipe(Effect.provide(TestWebSocketClientLayer)),
  );

  it.effect(
    "rejects token promises for Effect defects and synchronous callback throws",
    () =>
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient;
        const transport = yield* TestWebSocketTransport;
        const defect = new Error("test auth callback defect");
        const callbacks = [
          () => Effect.die(defect),
          (): Effect.Effect<never> => {
            throw defect;
          },
        ];
        for (const callback of callbacks) {
          yield* client.setAuth(callback);
          const [fetchToken] = yield* transport.nextAuth();
          yield* Effect.promise(() =>
            expect(fetchToken({ forceRefreshToken: true })).rejects.toThrow(
              "test auth callback defect",
            ),
          );
        }
      }).pipe(Effect.provide(TestWebSocketClientLayer)),
  );
});

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
        new ConvexError(
          yield* Schema.encodeEffect(NotFound)(new NotFound({ id: "abc" })),
        ),
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
        new ConvexError(
          yield* Schema.encodeEffect(NotFound)(new NotFound({ id: "abc" })),
        ),
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
        new ConvexError(
          yield* Schema.encodeEffect(NotFound)(new NotFound({ id: "abc" })),
        ),
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
        new ConvexError(
          yield* Schema.encodeEffect(NotFound)(new NotFound({ id: "abc" })),
        ),
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
        new ConvexError(
          yield* Schema.encodeEffect(NotFound)(new NotFound({ id: "abc" })),
        ),
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
