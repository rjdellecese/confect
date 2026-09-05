import { FunctionSpec, Ref } from "@confect/core";
import { assert, describe, expect, expectTypeOf, it } from "@effect/vitest";
import { getFunctionName, type FunctionType } from "convex/server";
import { ConvexError } from "convex/values";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as EffectRef from "effect/Ref";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as HttpClient from "@confect/js/HttpClient";
import * as InternalHttpClient from "../src/internal/HttpClient";

type Operation = FunctionType;

interface Call {
  readonly name: string;
  readonly args: unknown;
}

interface TestTransport extends InternalHttpClient.Transport {
  readonly calls: (operation: Operation) => Effect.Effect<ReadonlyArray<Call>>;
  readonly failNext: (
    operation: Operation,
    rejection: unknown,
  ) => Effect.Effect<void>;
  readonly auth: () => Effect.Effect<Option.Option<string>>;
}

// Keep inspection operations function-valued, like the fake's controls.
// @effect-diagnostics-next-line lazyEffect:off
class TestHttpTransport extends Context.Service<
  TestHttpTransport,
  TestTransport
>()("@confect/js/test/HttpClient.test/TestHttpTransport") {}

const TestHttpClientLayer = Layer.effectContext(
  Effect.gen(function* () {
    const context = yield* Effect.context<never>();
    const runSync = Effect.runSyncWith(context);
    const runPromise = Effect.runPromiseWith(context);
    const calls = yield* EffectRef.make<
      Readonly<Record<Operation, ReadonlyArray<Call>>>
    >({ query: [], mutation: [], action: [] });
    const rejections = yield* EffectRef.make<
      Readonly<Record<Operation, Option.Option<unknown>>>
    >({
      query: Option.none(),
      mutation: Option.none(),
      action: Option.none(),
    });
    const auth = yield* EffectRef.make<Option.Option<string>>(Option.none());

    const invokeEffect = Effect.fnUntraced(function* (
      operation: Operation,
      functionReference: Parameters<InternalHttpClient.Transport[Operation]>[0],
      args: unknown,
    ) {
      yield* EffectRef.update(calls, (current) => ({
        ...current,
        [operation]: [
          ...current[operation],
          { name: getFunctionName(functionReference), args },
        ],
      }));
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
      operation: Operation,
      functionReference: Parameters<InternalHttpClient.Transport[Operation]>[0],
      args: unknown,
    ): Promise<unknown> =>
      runPromise(invokeEffect(operation, functionReference, args));

    const service = TestHttpTransport.of({
      url: "https://test.convex.cloud",
      setAuth: (token) => {
        runSync(EffectRef.set(auth, Option.some(token)));
      },
      clearAuth: () => {
        runSync(EffectRef.set(auth, Option.none()));
      },
      query: (functionReference, args) =>
        invoke("query", functionReference, args),
      mutation: (functionReference, args) =>
        invoke("mutation", functionReference, args),
      action: (functionReference, args) =>
        invoke("action", functionReference, args),
      calls: Effect.fn("TestHttpTransport.calls")(function* (operation) {
        return (yield* EffectRef.get(calls))[operation];
      }),
      failNext: Effect.fn("TestHttpTransport.failNext")(
        function* (operation, rejection) {
          yield* EffectRef.update(rejections, (current) => ({
            ...current,
            [operation]: Option.some(rejection),
          }));
        },
      ),
      auth: Effect.fn("TestHttpTransport.auth")(function* () {
        return yield* EffectRef.get(auth);
      }),
    });

    return Context.empty().pipe(
      Context.add(TestHttpTransport, service),
      Context.add(HttpClient.HttpClient, InternalHttpClient.make(service)),
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

describe("HttpClient", () => {
  describe("query", () => {
    it.effect("uses empty args when omitted", () =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const transport = yield* TestHttpTransport;
        yield* client.query(noArgsQueryRef);
        expect(yield* transport.calls("query")).toEqual([
          { name: "notes:list", args: {} },
        ]);
      }).pipe(Effect.provide(TestHttpClientLayer)),
    );

    it.effect("passes provided args", () =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const transport = yield* TestHttpTransport;
        yield* client.query(argsQueryRef, { id: "abc" });
        expect(yield* transport.calls("query")).toEqual([
          { name: "notes:get", args: { id: "abc" } },
        ]);
      }).pipe(Effect.provide(TestHttpClientLayer)),
    );
  });

  describe("mutation", () => {
    it.effect("uses empty args when omitted", () =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const transport = yield* TestHttpTransport;
        yield* client.mutation(noArgsMutationRef);
        expect(yield* transport.calls("mutation")).toEqual([
          { name: "tasks:cleanup", args: {} },
        ]);
      }).pipe(Effect.provide(TestHttpClientLayer)),
    );

    it.effect("passes provided args", () =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const transport = yield* TestHttpTransport;
        yield* client.mutation(argsMutationRef, { text: "hello" });
        expect(yield* transport.calls("mutation")).toEqual([
          { name: "notes:insert", args: { text: "hello" } },
        ]);
      }).pipe(Effect.provide(TestHttpClientLayer)),
    );
  });

  describe("action", () => {
    it.effect("uses empty args when omitted", () =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const transport = yield* TestHttpTransport;
        yield* client.action(noArgsActionRef);
        expect(yield* transport.calls("action")).toEqual([
          { name: "random:getNumber", args: {} },
        ]);
      }).pipe(Effect.provide(TestHttpClientLayer)),
    );

    it.effect("passes provided args", () =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const transport = yield* TestHttpTransport;
        yield* client.action(argsActionRef, { to: "user@example.com" });
        expect(yield* transport.calls("action")).toEqual([
          { name: "email:send", args: { to: "user@example.com" } },
        ]);
      }).pipe(Effect.provide(TestHttpClientLayer)),
    );
  });

  it.effect("sets and clears authentication", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const transport = yield* TestHttpTransport;

      yield* client.setAuth("token");
      expect(yield* transport.auth()).toEqual(Option.some("token"));

      yield* client.clearAuth;
      expect(yield* transport.auth()).toEqual(Option.none());
    }).pipe(Effect.provide(TestHttpClientLayer)),
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

describe("HttpClient error decoding", () => {
  it.effect(
    "preserves generic argument tuples, results, and error channels",
    () =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
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
          client.action<typeof noArgsActionRef>,
        ).parameters.toEqualTypeOf<[ref: typeof noArgsActionRef, args?: {}]>();
        expectTypeOf(
          client.action<typeof argsActionRef>,
        ).parameters.toEqualTypeOf<
          [ref: typeof argsActionRef, args: { readonly to: string }]
        >();
        expectTypeOf(client.query(queryWithError, { id: "abc" })).toEqualTypeOf<
          Effect.Effect<
            { readonly text: string },
            NotFound | HttpClient.HttpClientError | Schema.SchemaError
          >
        >();
        expectTypeOf(
          client.mutation(mutationWithError, { id: "abc" }),
        ).toEqualTypeOf<
          Effect.Effect<
            null,
            NotFound | HttpClient.HttpClientError | Schema.SchemaError
          >
        >();
        expectTypeOf(
          client.action(actionWithError, { id: "abc" }),
        ).toEqualTypeOf<
          Effect.Effect<
            null,
            NotFound | HttpClient.HttpClientError | Schema.SchemaError
          >
        >();
      }).pipe(Effect.provide(TestHttpClientLayer)),
  );

  it.effect("decodes a query ConvexError", () =>
    Effect.gen(function* () {
      const transport = yield* TestHttpTransport;
      yield* transport.failNext(
        "query",
        new ConvexError({ _tag: "NotFound", id: "abc" }),
      );
      const client = yield* HttpClient.HttpClient;

      const result = yield* Effect.result(
        client.query(queryWithError, { id: "abc" }),
      );
      assert(Result.isFailure(result));
      assert(Schema.is(NotFound)(result.failure));
      expect(result.failure.id).toBe("abc");
    }).pipe(Effect.provide(TestHttpClientLayer)),
  );

  it.effect("wraps an unknown query rejection", () =>
    Effect.gen(function* () {
      const rejection = new Error("network down");
      const transport = yield* TestHttpTransport;
      yield* transport.failNext("query", rejection);
      const client = yield* HttpClient.HttpClient;

      const result = yield* Effect.result(
        client.query(queryWithError, { id: "abc" }),
      );
      assert(Result.isFailure(result));
      assert(Schema.is(HttpClient.HttpClientError)(result.failure));
      expect(result.failure.cause).toBe(rejection);
    }).pipe(Effect.provide(TestHttpClientLayer)),
  );

  it.effect("decodes a mutation ConvexError", () =>
    Effect.gen(function* () {
      const transport = yield* TestHttpTransport;
      yield* transport.failNext(
        "mutation",
        new ConvexError({ _tag: "NotFound", id: "abc" }),
      );
      const client = yield* HttpClient.HttpClient;

      const result = yield* Effect.result(
        client.mutation(mutationWithError, { id: "abc" }),
      );
      assert(Result.isFailure(result));
      expect(result.failure).toBeInstanceOf(NotFound);
    }).pipe(Effect.provide(TestHttpClientLayer)),
  );

  it.effect("wraps an unknown mutation rejection", () =>
    Effect.gen(function* () {
      const transport = yield* TestHttpTransport;
      yield* transport.failNext("mutation", new Error("network down"));
      const client = yield* HttpClient.HttpClient;

      const result = yield* Effect.result(
        client.mutation(mutationWithError, { id: "abc" }),
      );
      assert(Result.isFailure(result));
      expect(result.failure).toBeInstanceOf(HttpClient.HttpClientError);
    }).pipe(Effect.provide(TestHttpClientLayer)),
  );

  it.effect("decodes an action ConvexError", () =>
    Effect.gen(function* () {
      const transport = yield* TestHttpTransport;
      yield* transport.failNext(
        "action",
        new ConvexError({ _tag: "NotFound", id: "abc" }),
      );
      const client = yield* HttpClient.HttpClient;

      const result = yield* Effect.result(
        client.action(actionWithError, { id: "abc" }),
      );
      assert(Result.isFailure(result));
      expect(result.failure).toBeInstanceOf(NotFound);
    }).pipe(Effect.provide(TestHttpClientLayer)),
  );

  it.effect("wraps an unknown action rejection", () =>
    Effect.gen(function* () {
      const transport = yield* TestHttpTransport;
      yield* transport.failNext("action", new Error("network down"));
      const client = yield* HttpClient.HttpClient;

      const result = yield* Effect.result(
        client.action(actionWithError, { id: "abc" }),
      );
      assert(Result.isFailure(result));
      expect(result.failure).toBeInstanceOf(HttpClient.HttpClientError);
    }).pipe(Effect.provide(TestHttpClientLayer)),
  );
});
