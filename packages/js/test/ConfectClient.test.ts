import { FunctionSpec, Ref } from "@confect/core";
import { describe, expect, it } from "@effect/vitest";
import {
  Chunk,
  Context,
  Effect,
  Layer,
  Ref as MutableRef,
  Schema,
  Stream,
} from "effect";
import * as ConfectClient from "../src/ConfectClient";

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

const ConfectClientSpy = Context.GenericTag<{
  readonly queryCalls: MutableRef.Ref<ReadonlyArray<Call>>;
  readonly mutationCalls: MutableRef.Ref<ReadonlyArray<Call>>;
  readonly actionCalls: MutableRef.Ref<ReadonlyArray<Call>>;
  readonly reactiveQueryCalls: MutableRef.Ref<ReadonlyArray<Call>>;
  readonly reactiveQueryFinalizations: MutableRef.Ref<ReadonlyArray<string>>;
}>("@test/ConfectClientSpy");

const SpyLayer = Layer.effect(
  ConfectClientSpy,
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

const TestConfectClientLayer = Layer.effect(
  ConfectClient.ConfectClient,
  Effect.gen(function* () {
    const spy = yield* ConfectClientSpy;

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
  TestConfectClientLayer.pipe(Layer.provide(SpyLayer)),
);

describe("ConfectClient", () => {
  describe("query", () => {
    it.effect("args omitted when empty", () =>
      Effect.gen(function* () {
        const client = yield* ConfectClient.ConfectClient;
        const spy = yield* ConfectClientSpy;
        yield* client.query(noArgsQueryRef);
        expect(yield* MutableRef.get(spy.queryCalls)).toEqual([
          { name: "notes:list", args: {} },
        ]);
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("args passed when provided", () =>
      Effect.gen(function* () {
        const client = yield* ConfectClient.ConfectClient;
        const spy = yield* ConfectClientSpy;
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
        const client = yield* ConfectClient.ConfectClient;
        const spy = yield* ConfectClientSpy;
        yield* client.mutation(noArgsMutationRef);
        expect(yield* MutableRef.get(spy.mutationCalls)).toEqual([
          { name: "tasks:cleanup", args: {} },
        ]);
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("args passed when provided", () =>
      Effect.gen(function* () {
        const client = yield* ConfectClient.ConfectClient;
        const spy = yield* ConfectClientSpy;
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
        const client = yield* ConfectClient.ConfectClient;
        const spy = yield* ConfectClientSpy;
        yield* client.action(noArgsActionRef);
        expect(yield* MutableRef.get(spy.actionCalls)).toEqual([
          { name: "random:getNumber", args: {} },
        ]);
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("args passed when provided", () =>
      Effect.gen(function* () {
        const client = yield* ConfectClient.ConfectClient;
        const spy = yield* ConfectClientSpy;
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
        const client = yield* ConfectClient.ConfectClient;
        const result = yield* client
          .reactiveQuery(noArgsQueryRef)
          .pipe(Stream.take(1), Stream.runCollect);

        expect(Chunk.toReadonlyArray(result)).toEqual([{}]);
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("passes args", () =>
      Effect.gen(function* () {
        const client = yield* ConfectClient.ConfectClient;
        const spy = yield* ConfectClientSpy;
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
        const client = yield* ConfectClient.ConfectClient;
        const spy = yield* ConfectClientSpy;
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
